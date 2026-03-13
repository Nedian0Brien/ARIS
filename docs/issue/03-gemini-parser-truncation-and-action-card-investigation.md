# Gemini 응답 잘림 및 액션 카드 이상 조사

## 조사 대상

- `chatId`: `cmmowo67x0001mu38wrn4ancr`
- `threadId`: `50847f25-04a4-4e60-9b30-66ca516f8fa6`
- `sessionId`: `cmmmo3ocz0imlo114e4wgnpql`

## 확인 결과

### 1. 프론트 렌더링 문제가 아니라 저장 이전 파싱 문제다

`SessionChat` 레코드 기준으로 해당 채팅의 `latestPreview` 자체가 이미 잘린 상태다.

- `latestPreview`: `석 내용에 대해 더 궁금하시거나, 특정 부분에 대한 추가 조사가 필요하시면 말씀해 주세요. 어떤 작업을 먼저 진행할까요?`

즉, UI가 정상 본문을 받아 놓고 잘라서 보여주는 문제가 아니라, 백엔드가 저장한 본문 자체가 이미 손상되어 있다.

### 2. 실제 저장 메시지도 이미 잘려 있다

Happy DB `SessionMessage` 기준으로 대상 채팅 메시지는 아래처럼 저장되어 있다.

- 사용자 메시지: `현재 폴더 분석해봐`
- 액션 메시지 1: `path: README.md`
- 액션 메시지 2: `path: AGENTS.md`
- 최종 답변: `석 내용에 대해 더 궁금하시거나, 특정 부분에 대한 추가 조사가 필요하시면 말씀해 주세요. 어떤 작업을 먼저 진행할까요?`

여기서 핵심은 두 가지다.

1. 액션 카드용 메시지가 명령/출력 없이 `path:` 만 남아 있다.
2. 최종 텍스트 답변도 문장 앞부분이 유실되어 저장됐다.

### 3. 액션 카드 미노출의 직접 원인은 프론트보다 파서 품질 저하다

웹 UI는 `file_read`, `file_write`, `command_execution` 계열 이벤트를 액션 카드로 렌더링한다.
하지만 이번 케이스에서는 Gemini 파서가 액션 이벤트에서 `command` 와 `output` 을 거의 추출하지 못하고 `path` 만 남겼다.

현재 저장된 액션 메시지 예시:

- `title`: `File Read`
- `type`: `tool`
- `meta.actionType`: `file_read`
- `text`: `path: README.md`

이 경우 UI는 카드로 분류하더라도 카드 내용이 빈약하고, 사용자가 기대한 "무슨 행동을 했는지" 정보가 사실상 사라진다.

## 원인 분석

### 1. `geminiProtocolFields.ts` 의 문자열 추출 우선순위가 너무 단순하다

`extractFirstGeminiStringByKeys()` 는 중첩 레코드를 훑으면서 첫 번째 문자열만 반환한다.

- 파일: `services/aris-backend/src/runtime/providers/gemini/geminiProtocolFields.ts`

이 방식은 실제 Gemini CLI 이벤트가 여러 중첩 레코드와 부분 텍스트 조각을 포함할 때, 원하는 필드가 아니라 더 안쪽의 불완전한 문자열을 집어올 가능성이 높다.

이번 현상에서 최종 답변이 `분석 내용...` 이 아니라 `석 내용...` 으로 저장된 점을 보면, 완성 답변 전체가 아니라 내부 조각 문자열이 선택됐을 가능성이 높다.

### 2. `geminiProtocolMapper.ts` 가 실제 Gemini 이벤트 스키마를 충분히 커버하지 못한다

- 파일: `services/aris-backend/src/runtime/providers/gemini/geminiProtocolMapper.ts`

현재 액션 추출은 주로 다음 키들에 의존한다.

- `command`
- `cmd`
- `parsed_cmd`
- `output`
- `stdout`
- `result`
- `text`
- `path`

그런데 실제 대상 채팅에서는 저장 결과가 `path:` 만 남았으므로, 원본 이벤트 안에 있던 액션 정보가 다른 필드 구조로 들어왔고 현재 파서가 그것을 놓친 것으로 보인다.

즉:

- 파싱 실패라기보다는
- "일부 필드만 우연히 잡히고 핵심 필드는 놓치는 불완전한 파싱" 문제다.

### 3. 브리지 레이어는 파서 출력 그대로 저장하고 있다

- 파일: `services/aris-backend/src/runtime/providers/gemini/geminiEventBridge.ts`

`projectGeminiToolActionMessage()` 는 `action.command`, `action.path`, `action.output` 을 조합해 저장 본문을 만든다.
현재 저장 결과가 `path: README.md` 만 남았다는 것은 브리지 문제가 아니라, 이미 `GeminiActionEvent` 가 빈약하게 만들어졌다는 뜻이다.

`projectGeminiTextMessage()` 도 마지막 `text` envelope 를 그대로 사용하므로, 잘린 텍스트가 저장된 책임 역시 상류 파서에 있다.

## 결론

이번 현상은 다음 두 문제가 동시에 발생한 사례다.

1. Gemini 최종 답변 텍스트를 잘못 추출해서 문장 앞부분이 잘린 상태로 저장함
2. Gemini 액션 이벤트에서 `command/output` 을 제대로 추출하지 못해 액션 카드 정보가 `path:` 수준으로 축소됨

정리하면:

- 단순 JSON 파싱 실패는 아니다.
- 프론트 렌더링 버그도 아니다.
- **Gemini CLI 스트림 이벤트를 현재 파서가 실제 스키마대로 충분히 해석하지 못하는 것이 핵심 원인**이다.

## 권장 대응

1. 대상 채팅의 원본 Gemini raw 이벤트를 수집할 수 있도록 로그 보존 범위를 보강한다.
2. `geminiProtocolMapper` 에 실제 문제 케이스 fixture 를 추가한다.
3. `extractFirstGeminiStringByKeys()` 기반의 "첫 문자열 채택" 전략을 버리고, 이벤트 타입별 우선 경로를 명시적으로 만든다.
4. 액션 이벤트는 `commandActions`, `aggregatedOutput`, `item.command`, `item.path` 같은 실제 필드 조합을 우선 해석하도록 보강한다.
5. 텍스트 이벤트는 `assistant final/result` 계열만 채택하고, delta/부분 조각은 누적 후 최종본만 저장하도록 제한한다.
