# Gemini 채팅 실시간 스트리밍 누락 분석

## 요약

현재 ARIS에서 Gemini 에이전트 메시지가 실시간으로 흘러오지 않고 마지막에 하나의 메시지로 합쳐지는 주된 원인은, Gemini CLI 의 `delta` 이벤트를 실제 스트리밍 텍스트로 승격하지 않고 최종 완료 메시지 또는 최종 집계 텍스트만 저장하는 구조에 있다.

참고 리포 `siteboon/claudecodeui` 는 Gemini `delta` 를 WebSocket 으로 즉시 프론트에 전달하고, 프론트가 짧은 버퍼링 후 같은 메시지 버블에 이어붙이는 구조다. 반면 ARIS 는 `delta` 를 파싱하더라도 `onText` 로 내보내지 않으며, 결과적으로 실시간 갱신 대신 최종 메시지 persist 시점에만 UI 가 갱신된다.

## 비교 대상

- 현재 리포: `services/aris-backend`, `services/aris-web`
- 참고 리포: `references/claudecodeui`

## ARIS 현재 구조

### 1. Gemini CLI 스트림은 line 단위로 읽는다

`services/aris-backend/src/runtime/happyClient.ts` 의 `runCommandStreaming()` 은 stdout 을 줄 단위로 파싱하고, Gemini 인 경우 `parseGeminiStreamLine()` 과 `extractGeminiStreamTextEvent()` 를 통해 텍스트 이벤트를 추출한다.

### 2. 하지만 Gemini delta 는 text envelope 로 승격되지 않는다

`services/aris-backend/src/runtime/providers/gemini/geminiProtocolMapper.ts` 에서:

- `codex/event/agent_message_content_delta`
- `type: "message" + delta: true`

형태의 입력은 `assistantText` 로는 파싱된다.

하지만 이 경우 `assistantIsDelta` 가 `true` 이므로 `text` envelope 는 만들지 않는다.

즉 delta 는 내부 누적용 데이터로만 보고, 실시간 전송 대상으로는 보지 않는 셈이다.

### 3. `extractGeminiStreamTextEvent()` 는 text envelope 가 없으면 아무 것도 내보내지 않는다

`services/aris-backend/src/runtime/happyClient.ts` 의 `extractGeminiStreamTextEvent()` 는:

- `assistantText` 가 있어도
- envelope 안에 `kind === "text"` 가 없으면

`null` 을 반환한다.

그래서 Gemini delta 라인은 `onText` 를 전혀 타지 못한다.

### 4. 결과적으로 UI 는 최종 메시지 persist 시점에만 갱신된다

현재 ARIS 에서 Gemini 텍스트는 주로 아래 두 경로 중 하나에서만 저장된다.

1. `item/completed` 의 `agentMessage`
2. turn 종료 후 `parseGeminiStreamOutput()` 가 조립한 최종 `output`

즉 사용자는 delta 스트리밍을 보지 못하고, 완료 시점의 완성 문장만 보게 된다.

## claudecodeui 구조

### 1. 서버가 Gemini delta 를 즉시 transport 레벨로 보낸다

`references/claudecodeui/server/gemini-response-handler.js` 는 다음 이벤트를 바로 WebSocket 으로 전달한다.

- `event.type === "message"`
- `event.role === "assistant"`

이때 payload 에:

- `content`
- `isPartial: event.delta === true`

를 담아 바로 전송한다.

즉 delta 를 "최종 조립 전 중간 산출물" 이 아니라 "실시간 렌더링 가능한 조각" 으로 취급한다.

### 2. 프론트가 delta 를 버퍼링하며 같은 메시지에 이어붙인다

`references/claudecodeui/src/components/chat/hooks/useChatRealtimeHandlers.ts` 에서:

- `gemini-response`
- `isPartial === true`

인 경우 `streamBufferRef` 에 텍스트를 누적한다.

그리고 약 100ms 후 `appendStreamingChunk()` 를 호출해 기존 메시지 버블에 chunk 를 이어붙인다.

마지막 chunk 가 오면 즉시 flush 하고 `finalizeStreamingMessage()` 로 마무리한다.

즉 스트리밍 transport 와 UI 조립이 분리되어 있고, 프론트는 delta 스트림을 독립적인 렌더링 소스로 사용한다.

## 구조적 차이

### ARIS

- CLI line 파싱
- protocol envelope 정규화
- 메시지 persist
- SSE 로 persisted event polling
- 프론트는 저장된 이벤트 목록을 렌더링

이 구조에서는 "실시간 텍스트" 도 결국 저장된 이벤트여야 화면에 나타난다.

### claudecodeui

- CLI line 파싱
- WebSocket 으로 즉시 push
- 프론트 메모리 상태에서 streaming bubble 조립
- 완료 후 세션 저장은 별도 처리

즉 렌더링 경로와 저장 경로가 분리되어 있다.

## 왜 지금처럼 마지막에만 한 번 보이는가

현재 ARIS 는 Gemini delta 를 파싱하더라도:

1. delta 에 대해 `text` envelope 를 만들지 않고
2. `extractGeminiStreamTextEvent()` 는 `text` envelope 가 없으면 버리고
3. SSE 는 persisted message/event 만 내보내고
4. 프론트는 persisted event 목록만 렌더링한다

이 4단계가 겹치면서, delta 는 실시간 UI 경로에 진입하지 못한다.

## 근거 fixture

`services/aris-backend/tests/fixtures/gemini/streaming-item-completed.jsonl` 을 보면 실제로:

1. `agent_message_content_delta` 두 줄이 먼저 오고
2. 이후 `item/completed` 의 `agentMessage` 가 온다

현재 구현은 앞의 delta 두 줄을 UI 에 실시간 반영하지 않고, 뒤의 completed 메시지에 의존한다.

## 해결 방안 옵션

### 옵션 A. 현재 구조를 유지하면서 Gemini delta 를 persisted text event 로 승격

핵심 아이디어:

- Gemini delta 를 turn/item 기준으로 누적
- 새 chunk 가 들어올 때마다 `agent_message` 이벤트를 저장
- 같은 `sessionTurnId` 또는 `item_id` 에 대해 프론트가 마지막 이벤트 기준으로 병합 렌더링

장점:

- 현행 SSE + persisted event 구조를 크게 깨지 않는다
- 서버 재시작/재연결 시에도 복원성이 높다

단점:

- 이벤트 수가 급격히 늘 수 있다
- 현재 ChatInterface 는 text reply 병합 로직이 약해서 추가 설계가 필요하다
- 저장소 오염과 중복 제거 정책을 같이 설계해야 한다

### 옵션 B. Gemini 전용 실시간 채널을 추가하고, 저장은 완료 시점에만 유지

핵심 아이디어:

- Gemini delta 는 별도 SSE 또는 WebSocket 채널로 즉시 전달
- 프론트는 메모리 상태에서만 streaming bubble 을 조립
- 완료 시점에만 최종 메시지를 persist

장점:

- `claudecodeui` 와 가장 유사한 사용자 경험을 빠르게 만들 수 있다
- DB/스토어에 delta 이벤트를 대량 저장하지 않는다

단점:

- ARIS 의 현재 "UI 는 persisted event 를 렌더링한다"는 구조와 어긋난다
- 재연결/새로고침 복구를 별도 설계해야 한다
- Codex/Claude 와 실시간 경로가 달라질 수 있다

### 옵션 C. protocol envelope 를 실시간 상태와 저장 상태로 분리

권장안.

핵심 아이디어:

- `parseGeminiStreamLine()` 에서 delta 도 명시적 envelope 로 만든다
- 예: `text-delta` 또는 `text` + `partial: true`
- 런타임은 이 envelope 를 즉시 프론트 스트림으로 내보낸다
- 동시에 turn 단위 누적기를 유지해 완료 시 최종 `text` event 만 persist 한다

장점:

- transport/normalize 계층에서 문제를 구조적으로 해결한다
- UI 는 실시간 delta 와 최종 persisted event 를 모두 일관되게 다룰 수 있다
- Gemini 뿐 아니라 향후 다른 provider 의 delta 처리 규약으로 확장 가능하다

단점:

- 백엔드 protocol 계약과 프론트 렌더링 계약을 함께 손봐야 한다
- 단기 패치보다 수정 범위가 넓다

## 권장 방향

단기적으로는 옵션 A 보다 옵션 C 가 맞다.

이유:

- 현재 문제는 단순 버그라기보다 "delta 를 어떤 계층에서 1급 이벤트로 인정하느냐"의 구조 문제다.
- 옵션 A 는 빠른 패치가 가능하지만, 결국 persisted event 와 streaming state 가 섞여 중복/병합 문제가 다시 생길 가능성이 높다.
- 옵션 C 는 현재 protocol envelope 기반 설계를 살리면서도 Gemini delta 를 정식 스트림 이벤트로 승격할 수 있다.

## 구체적 수정 포인트

1. `services/aris-backend/src/runtime/providers/gemini/geminiProtocolMapper.ts`
   Gemini delta 이벤트를 실시간 송출 가능한 envelope 로 매핑

2. `services/aris-backend/src/runtime/happyClient.ts`
   `extractGeminiStreamTextEvent()` 가 completed text envelope 에만 의존하지 않도록 수정

3. `services/aris-web/lib/hooks/useSessionEvents.ts`
   필요하면 실시간 delta 이벤트 타입을 받을 수 있게 확장

4. `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
   같은 turn/item 의 partial text 를 하나의 버블로 병합 렌더링하는 로직 추가

5. 테스트
   Gemini delta-only fixture 에 대해 "실시간 중간 텍스트가 여러 번 관측되고, 최종적으로 하나의 메시지로 정리된다"는 시나리오를 추가

## 결론

현재 현상은 프론트 렌더링 문제라기보다, 백엔드가 Gemini delta 를 실시간 텍스트 이벤트로 취급하지 않는 구조에서 발생한다.

`claudecodeui` 는 delta 를 transport 레벨에서 그대로 흘려보내고 프론트가 조립한다. ARIS 는 delta 를 최종 메시지 조립 재료로만 보고 저장 완료 시점에만 UI 로 노출한다. 따라서 실시간 출력 문제를 해결하려면, Gemini delta 를 protocol 및 UI 양쪽에서 "실시간 이벤트" 로 승격하는 방향으로 설계를 바꾸는 것이 맞다.
