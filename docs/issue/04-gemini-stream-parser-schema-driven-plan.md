# Gemini 스트림 파서 스키마 기반 개선 계획

## 목적

Gemini 응답 잘림과 액션 카드 정보 손실 문제를, 추측한 JSON 키 목록이 아니라 실제 런타임 이벤트 스키마를 기준으로 해결한다.

이번 계획의 핵심은 다음 두 가지다.

1. raw/parsed 로그에서 실제로 관측된 Gemini 이벤트 메서드와 payload 형태를 fixture 로 고정한다.
2. `extractFirstGeminiStringByKeys()` 같은 범용 문자열 스캔 방식 대신, 이벤트 타입별 전용 파서를 둔다.

## 실제로 확인한 이벤트 형태

`.runtime/aris-backend/logs` 와 `logs` 에 남은 Gemini 관련 raw/parsed 이벤트를 보면, 현재 파서가 가정하는 단순 형태와 실제 입력이 다르다.

### 1. 텍스트는 완성 문자열이 아니라 delta 조각으로 들어온다

raw 로그에서 실제로 관측된 메서드:

- `codex/event/agent_message_content_delta`
- `codex/event/agent_message_delta`

관측된 공통 필드:

- `params.id`
- `params.msg.type`
- `params.msg.thread_id`
- `params.msg.turn_id`
- `params.msg.item_id`
- `params.msg.delta`
- `params.conversationId`

즉 Gemini 텍스트는 단일 `content` 나 `result` 문자열 하나가 아니라, `item_id` 와 `turn_id` 를 키로 묶어 누적해야 하는 delta 스트림이다.

현재 `geminiProtocolMapper.ts` 는 각 line 마다 첫 번째 문자열 후보를 찾고, 최종적으로 길이가 가장 긴 문자열 하나를 택한다. 이 방식은 다음 문제를 만든다.

- 부분 조각을 완성 메시지로 오인할 수 있다.
- `agent_message_delta` 와 `agent_message_content_delta` 가 섞여 있을 때 임의 조각을 잡을 수 있다.
- 그 결과 `"분석 내용..."` 이 아니라 `"석 내용..."` 같은 앞부분 유실이 발생할 수 있다.

### 2. 액션은 단순 `command/path/output` 평탄 구조가 아닐 수 있다

현재 파서는 다음 키를 우선 스캔한다.

- `command`
- `cmd`
- `parsed_cmd`
- `path`
- `output`
- `stdout`
- `result`
- `text`

하지만 실제 저장 결과를 보면 Gemini 액션 메시지는 `path: README.md`, `path: AGENTS.md` 수준으로만 남았다. 이것은 원본 이벤트가 더 풍부했더라도, 현재 파서가 중간 구조를 놓치고 `path` 만 건진 사례로 봐야 한다.

또한 현재 테스트 fixture 는 대부분 다음처럼 지나치게 단순하다.

- `type: "tool"`
- `subtype: "command_execution"`
- `command: "pwd"`
- `output: "/workspace"`

이 형태만으로는 실제 Gemini tool lifecycle 을 재현하지 못한다.

## 현재 파서의 구조적 한계

### 1. `geminiProtocolFields.ts`

`extractFirstGeminiStringByKeys()` 는 중첩 레코드를 전부 순회한 뒤, 주어진 키에 대해 처음 발견한 문자열을 반환한다.

이 접근은 이벤트 의미를 전혀 고려하지 않는다.

- delta 문자열과 final 문자열을 구분하지 못한다.
- `text`, `result`, `content` 중 어느 것이 final 인지 알 수 없다.
- tool event 안의 설명 텍스트와 실제 command/output 을 구분하지 못한다.

### 2. `geminiProtocolMapper.ts`

현재 mapper 는 line 단위 stateless 해석에 가깝다.

- 텍스트 누적 상태가 없다.
- `item_id` / `turn_id` / `conversationId` 기반 조립이 없다.
- tool call start/end 와 결과 payload 를 분리해서 다루지 않는다.
- 최종 assistant text 도 "가장 긴 문자열" 휴리스틱에 의존한다.

이 구조에서는 실제 스트리밍 프로토콜을 안정적으로 해석할 수 없다.

### 3. 현재 테스트가 실제 스키마를 반영하지 못한다

`services/aris-backend/tests/geminiProtocolMapper.test.ts` 의 fixture 는 대부분 평탄한 JSON 객체다. 그래서 지금 같은 문제를 회귀 테스트로 잡을 수 없다.

## 개선 방향

### 1. raw 이벤트 fixture 를 먼저 만든다

우선순위가 가장 높다.

추가할 fixture 종류:

1. `agent_message_content_delta` 다수 + final stop/result 조합
2. `agent_message_delta` 와 `agent_message_content_delta` 혼합 케이스
3. tool call start/end + command/output/path 가 분산된 케이스
4. 현재 장애 케이스와 최대한 유사한 "파일 읽기 2회 + 잘린 최종 텍스트" 케이스

fixture 소스는 실제 `.runtime/aris-backend/logs` 에서 추출한 raw ndjson 을 그대로 축약해 사용한다.

### 2. line parser 를 event-aware parser 로 바꾼다

권장 구조:

- `parseGeminiJsonLine()` 로 JSON 파싱
- `extractGeminiEventDescriptor()` 로 `method`, `params.msg.type`, `conversationId`, `turn_id`, `item_id` 를 구조적으로 분리
- `GeminiStreamAssembler` 같은 누적기에서 turn/message/action 상태를 관리

상태 키 제안:

- 텍스트 조립 키: `conversationId + turn_id + item_id`
- 액션 조립 키: `conversationId + turn_id + call_id` 또는 provider 가 주는 call 식별자

### 3. 텍스트는 delta 누적 후 final 시점에만 확정한다

권장 규칙:

- `agent_message_content_delta` / `agent_message_delta` 는 누적만 한다.
- `result`, `stop`, `final assistant message` 성격의 이벤트가 올 때만 확정 메시지를 만든다.
- 브리지에는 확정된 텍스트만 내려보낸다.

이렇게 해야 `latestPreview` 와 최종 agent message 에 부분 문자열이 저장되지 않는다.

### 4. 액션은 tool lifecycle 기준으로 조립한다

권장 규칙:

- tool start 에서는 call identity 와 tool type 만 기록
- tool end 또는 result 이벤트에서 command/path/output/diff 를 병합
- `command` 가 없더라도 `path` 만으로 섣불리 완결 action 을 만들지 않는다

특히 `file_read` / `file_write` / `command_execution` 판정은 line 전체 텍스트 휴리스틱보다, provider event type 과 구조 필드를 우선해야 한다.

### 5. 공통 문자열 스캐너는 보조 수단으로만 남긴다

`extractFirstGeminiStringByKeys()` 는 완전히 제거하지 않아도 되지만, 아래 용도로만 제한하는 편이 맞다.

- session/thread 식별자 fallback
- 디버그용 보조 추출

최종 assistant text 나 tool payload 추출의 주 경로로 쓰면 안 된다.

## 구현 순서

### 1단계. fixture 및 실패 재현 테스트

- 실제 raw 이벤트에서 Gemini fixture 추출
- `geminiProtocolMapper.test.ts` 에 delta 누적 실패 케이스 추가
- 액션 카드 정보 손실 케이스 추가

완료 기준:

- 현재 코드에서 테스트가 실패한다.

### 2단계. assembler 도입

- delta 누적용 상태 객체 추가
- final/result 이벤트에서만 assistant text 확정
- tool lifecycle 병합 로직 추가

완료 기준:

- 잘림 케이스에서 완전한 최종 텍스트가 나온다.
- `README.md`, `AGENTS.md` 액션이 `path` 만이 아니라 구조화된 action 으로 남는다.

### 3단계. 브리지/저장 레이어 검증

- `geminiEventBridge.ts` 와 persisted `SessionMessage` projection 확인
- `latestPreview` 와 agent message 가 동일하게 정상 본문을 가지는지 확인

완료 기준:

- DB 저장 결과에서 앞부분 유실이 사라진다.
- 액션 카드 렌더링에 필요한 `command/path/output` 중 최소 한 가지 이상이 구조적으로 보존된다.

### 4단계. 회귀 방지

- 실제 장애 fixture 를 테스트 자산으로 유지
- provider별 파서가 서로 다른 입력 스키마를 다룬다는 점을 테스트에 명시

## 권장 코드 변경 지점

- `services/aris-backend/src/runtime/providers/gemini/geminiProtocolFields.ts`
- `services/aris-backend/src/runtime/providers/gemini/geminiProtocolMapper.ts`
- `services/aris-backend/tests/geminiProtocolMapper.test.ts`
- 필요 시 `services/aris-backend/tests/geminiAlignment.e2e.test.ts`

## 실무 판단

이번 문제는 단순 bugfix 라기보다 파서 전략 자체를 바꾸는 작업이다.

따라서 다음 접근이 맞다.

1. 실제 이벤트 fixture 를 먼저 확보한다.
2. fixture 기준으로 parser/assembler 를 교체한다.
3. 그 다음에만 저장 결과와 UI 액션 카드 동작을 다시 본다.

fixture 없이 휴리스틱을 계속 덧붙이면, 이번 잘림은 우연히 고쳐도 다음 Gemini CLI 이벤트 변화에서 다시 깨질 가능성이 높다.
