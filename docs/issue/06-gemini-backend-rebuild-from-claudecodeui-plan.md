# Plan: Gemini Backend Rebuild From claudecodeui

**Generated**: 2026-03-14
**Estimated Complexity**: High

## Overview
현재 Gemini 경로는 `happyClient.ts` 내부의 휴리스틱 파싱, realtime partial 버퍼, final fallback persistence가 강하게 얽혀 있어 실운영 payload 변형이 들어오면 중간 코멘터리 유실, 마지막 뭉침, abort 시 텍스트 증발 같은 문제가 반복된다.

이번 계획은 `references/claudecodeui`의 Gemini 처리 방식을 기준으로, ARIS의 Gemini backend를 "raw Gemini stream -> canonical internal event -> realtime/persist projection" 3단 구조로 재구성하는 것이다.

기본 가정:
- 1차 범위는 Gemini에 한정한다.
- Claude/Codex 경로는 건드리지 않는다.
- 현재 web UI 계약은 최대한 유지하되, Gemini 내부 event contract는 새로 정의한다.
- 운영 전환은 기능 플래그 뒤에서 수행한다.

## Non-Goals
- Claude/Codex provider 공통 추상화 전면 재작성
- Chat UI의 대규모 디자인 변경
- SessionMessage 전체 스키마 재설계

## Reference Baseline
- `references/claudecodeui/server/gemini-response-handler.js`
- `references/claudecodeui/src/components/chat/hooks/useChatRealtimeHandlers.ts`

## Reference vs ARIS Delta
| Concern | `claudecodeui` baseline | 기존 ARIS 문제 지점 | 이번 재구성 방향 |
| --- | --- | --- | --- |
| Raw parsing | NDJSON line을 즉시 parse | `happyClient.ts` 안에서 parser/partial/persist가 결합 | `geminiStreamAdapter.ts`로 분리 |
| Identity | socket message 단위로 단순 append | `threadId`/`turnId`/`itemId`가 payload 변형마다 흔들림 | `geminiIdentityAssembler.ts`로 복원 |
| Realtime lane | assistant delta를 즉시 push | delta와 final fallback이 서로 덮어씀 | `text_delta`는 realtime 전용으로 유지 |
| Persist lane | partial finalize 후 최종 bubble 확정 | commentary/final이 마지막에 한 번에 저장될 수 있음 | `text_completed`만 persist 대상으로 사용 |
| Abort cleanup | streaming state만 정리 | 완료된 commentary까지 증발 가능 | 미완료 partial만 정리, completed text는 보존 |
| Web contract | streaming bubble append/finalize | backend 이벤트 불안정성으로 UI가 빈 상태가 되거나 마지막에 뭉침 | 기존 SSE/UI 계약 유지, backend shim으로 호환 |

## Implementation Status
- Sprint 1 완료: 운영 transcript 기반 fixture와 canonical contract 타입 정의 추가
- Sprint 2 완료: `geminiStreamAdapter.ts`, `geminiIdentityAssembler.ts` 추가 및 `happyClient.ts`에서 Gemini line parsing 분리
- Sprint 3 완료: `geminiEventBridgeV2.ts` 추가, realtime partial과 completed persistence 경로 분리, final fallback 최소화
- Sprint 4 완료: `GEMINI_STREAM_BACKEND_V2` 플래그 추가, web 기존 이벤트 계약과 호환 검증 완료
- Sprint 5 진행: automated verification 완료, 실제 운영 수동 Gemini 시나리오 재확인만 남음

## Sprint 1: Raw Event Taxonomy 확정
**Goal**: 실제 Gemini payload 변형을 수집하고 ARIS 내부 표준 이벤트 계약을 정의한다.
**Demo/Validation**:
- 실제 운영 로그 기반 fixture가 준비되어야 한다.
- 각 fixture에서 commentary, tool, abort, final answer의 순서가 사람이 읽을 수 있게 재구성되어야 한다.

### Task 1.1: 실로그 fixture 수집
- **Location**: `services/aris-backend/tests/fixtures/gemini/`
- **Description**: 운영 로그와 `~/.gemini/tmp/aris/chats/*.json`를 대조해 다음 케이스를 fixture로 고정한다.
  - commentary만 여러 개 나온 turn
  - `item/agentMessage/delta`만 존재하는 turn
  - `codex/event/agent_message_content_delta` + `item/agentMessage/delta` + `codex/event/agent_message_delta` 혼합 turn
  - tool action 뒤 commentary가 이어지는 turn
  - abort된 turn
  - final answer까지 정상 완료된 turn
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - fixture마다 실제 raw event line과 기대 타임라인이 문서화된다.
  - 현재 parser로 왜 실패하는지 재현 가능해야 한다.
- **Validation**:
  - fixture 인덱스 문서 작성
  - 기존 parser 테스트로 실패 케이스 확인

### Task 1.2: Canonical Gemini event contract 정의
- **Location**: `services/aris-backend/src/runtime/providers/gemini/`
- **Description**: Gemini 전용 내부 이벤트를 아래 수준으로 확정한다.
  - `turn_started`
  - `text_delta`
  - `text_completed`
  - `tool_started`
  - `tool_completed`
  - `permission_requested`
  - `turn_completed`
  - `turn_aborted`
  - `turn_failed`
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - event마다 필수 identity(`threadId`, `turnId`, `itemId`, `callId`)와 선택 필드가 명시된다.
  - commentary/final 구분 규칙이 phase 의존인지 item lifecycle 의존인지 명확해진다.
- **Validation**:
  - contract markdown 또는 타입 정의 초안 작성

### Task 1.3: Reference-ARIS 차이 분석 고정
- **Location**: `docs/issue/06-gemini-backend-rebuild-from-claudecodeui-plan.md`
- **Description**: `claudecodeui`의 Gemini handler가 어떤 단위로 push하는지와 ARIS가 어디서 합쳐버리는지 차이를 표로 남긴다.
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - raw parsing, websocket/realtime emit, final persistence, abort cleanup 차이가 정리된다.
- **Validation**:
  - 체크리스트 완성

## Sprint 2: Parser/Assembler 분리
**Goal**: `happyClient.ts`에서 Gemini raw parsing을 떼어내고, reference 스타일의 Gemini stream adapter를 만든다.
**Demo/Validation**:
- adapter 단독 테스트로 raw fixture를 canonical events로 안정적으로 변환해야 한다.

### Task 2.1: Gemini stream adapter 신규 추가
- **Location**: `services/aris-backend/src/runtime/providers/gemini/geminiStreamAdapter.ts`
- **Description**: raw line을 입력받아 canonical Gemini events를 순차 방출하는 adapter를 새로 만든다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - `geminiProtocolMapper.ts`의 휴리스틱 누적 로직을 직접 persistence에 쓰지 않는다.
  - delta 변형 3종을 모두 하나의 `text_delta`로 정규화한다.
  - completed message는 `text_completed`로 별도 방출한다.
- **Validation**:
  - fixture 기반 adapter unit test 통과

### Task 2.2: Identity assembler 추가
- **Location**: `services/aris-backend/src/runtime/providers/gemini/geminiIdentityAssembler.ts`
- **Description**: thread/turn/item/call identity를 raw 이벤트들 사이에서 보강하는 assembler를 만든다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - `item/agentMessage/delta`와 `codex/event/agent_message_delta`가 같은 logical message로 묶인다.
  - identity가 없는 delta라도 직전 context에서 복원 가능한 규칙이 분리된다.
- **Validation**:
  - identity reconstruction test 추가

### Task 2.3: happyClient Gemini parser 호출부 교체
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`
- **Description**: Gemini만 새 adapter를 통해 canonical event를 받도록 바꾸고, 기존 line별 heuristic 직접 분기를 걷어낸다.
- **Dependencies**: Task 2.1, Task 2.2
- **Acceptance Criteria**:
  - Gemini raw parsing 로직이 `happyClient.ts` 내부에 남지 않는다.
  - `happyClient.ts`는 canonical event 소비자 역할만 한다.
- **Validation**:
  - typecheck 통과
  - 기존 Gemini parser 관련 테스트 일부 제거/이전

## Sprint 3: Realtime lane과 Persist lane 완전 분리
**Goal**: 실시간 표시와 최종 저장을 분리해 중간 코멘터리가 마지막 fallback에 의해 덮이거나 abort에서 사라지지 않게 한다.
**Demo/Validation**:
- abort된 Gemini turn에서도 이미 생성된 commentary는 남아 있어야 한다.
- running 중에는 delta가 실시간으로 이어붙고, completed 시 completed message로 승격돼야 한다.

### Task 3.1: Gemini event bridge v2 추가
- **Location**: `services/aris-backend/src/runtime/providers/gemini/geminiEventBridgeV2.ts`
- **Description**: canonical event를 ARIS의 두 lane으로 투사한다.
  - realtime lane: `text_delta`, progress, live tool updates
  - persist lane: `text_completed`, tool_completed, lifecycle events
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - delta는 절대 final persisted text를 직접 대체하지 않는다.
  - completed text는 item identity 기준으로 한 번만 persist된다.
  - abort 시 delta 버퍼만 정리하고 이미 completed된 commentary는 보존된다.
- **Validation**:
  - bridge unit tests

### Task 3.2: Final fallback 제거 또는 Gemini 한정 최소화
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`
- **Description**: Gemini의 `response.output` 최종 fallback은 recovery 전용으로만 남기고 정상 stream path에서는 비활성화한다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - commentary/final이 마지막 한 메시지로 다시 뭉치지 않는다.
  - fallback은 "stream parser가 아무 text_completed도 만들지 못한 경우"에만 동작한다.
- **Validation**:
  - regression test: final lump 재발 금지

### Task 3.3: Abort semantics 재정의
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`
- **Description**: abort/finally에서 Gemini realtime partial 전체 삭제 대신 상태별 정리 규칙을 둔다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - completed text는 abort에서도 살아남는다.
  - 미완료 partial만 정리된다.
- **Validation**:
  - abort fixture test

## Sprint 4: ARIS 통합과 UI 호환
**Goal**: 현재 web 계약을 유지하면서 새 Gemini backend를 연결한다.
**Demo/Validation**:
- 기존 채팅 화면에서 코드 수정 없이도 중간 코멘터리와 액션 카드가 시간순으로 보여야 한다.

### Task 4.1: Gemini feature flag 추가
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`, env/config
- **Description**: `GEMINI_STREAM_BACKEND_V2` 같은 플래그를 두고 구/신 경로를 전환 가능하게 한다.
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - 세션별 또는 프로세스별로 안전하게 전환 가능하다.
- **Validation**:
  - flag on/off integration test

### Task 4.2: realtime-events contract 검증
- **Location**: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/stream/route.ts`, `services/aris-web/lib/hooks/useSessionEvents.ts`
- **Description**: 새 Gemini realtime event가 기존 SSE와 충돌하지 않는지 확인하고, 필요한 최소 조정만 한다.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - partial bubble이 같은 message identity에 누적된다.
  - final completed message 도착 시 partial이 자연스럽게 대체된다.
  - reconnect/backfill에서 중복 버블이 생기지 않는다.
- **Validation**:
  - web vitest

### Task 4.3: Compatibility shim 작성
- **Location**: `services/aris-backend/src/runtime/providers/gemini/`
- **Description**: 기존 `SessionMessage` / `UiEvent` 메타 필드를 필요 최소한으로 유지하는 shim을 둔다.
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - 기존 ChatInterface가 Gemini만 위해 대규모 분기하지 않는다.
- **Validation**:
  - snapshot or event normalization test

## Sprint 5: 운영 검증 및 전환
**Goal**: 실제 Gemini 세션에서 reference 수준의 스트리밍 신뢰성을 확인하고 전환한다.
**Demo/Validation**:
- 사용자 시나리오 5개에서 commentary가 즉시 보이고, 마지막 뭉침이 재현되지 않아야 한다.

### Task 5.1: Golden scenario 수동 검증
- **Location**: 실제 dev/prod-like 환경
- **Description**: 아래 시나리오를 수동 점검한다.
  - 파일 읽기 중심 조사형 프롬프트
  - 긴 reasoning 뒤 tool call
  - tool call 없는 commentary-only turn
  - abort mid-stream
  - final answer 완료 turn
- **Dependencies**: Sprint 4
- **Acceptance Criteria**:
  - 시나리오별 expected timeline 캡처 확보
- **Validation**:
  - 캡처와 session logs 비교

### Task 5.2: Main rollout
- **Location**: GitHub Actions / production
- **Description**: 플래그 on으로 점진 전환 후 main 배포를 확인한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - deploy 성공
  - 최소 1개 실제 Gemini 채팅에서 commentary 실시간 출력 확인
- **Validation**:
  - GitHub Actions 성공
  - prod session spot check

## Testing Strategy
- Backend unit:
  - raw fixture -> canonical event
  - canonical event -> realtime/persist projection
- Backend integration:
  - Gemini turn 성공/abort/failed
  - duplicate delta variants 혼합
- Web:
  - SSE backfill + realtime merge
  - partial -> final replacement
  - reconnect dedupe
- Manual:
  - 실제 Gemini transcript와 ARIS timeline 1:1 대조

## Potential Risks & Gotchas
- Gemini payload 형식이 생각보다 더 많을 수 있다.
  - mitigation: Sprint 1 fixture 수집을 먼저 끝낸다.
- delta 이벤트가 중복 채널로 동시에 들어오면 텍스트가 두 번 붙을 수 있다.
  - mitigation: identity + source-aware dedupe를 adapter 단계에서 처리한다.
- abort/final cleanup 규칙을 잘못 잡으면 partial 유령 버블이 남는다.
  - mitigation: completed와 incomplete state를 분리 저장한다.
- 기존 UI 계약을 너무 강하게 유지하면 새 backend가 reference 장점을 못 살릴 수 있다.
  - mitigation: backend canonical contract는 새로 만들고, UI 호환은 shim으로 처리한다.

## Rollback Plan
- `GEMINI_STREAM_BACKEND_V2` 플래그 off로 즉시 기존 경로 복귀
- Gemini 전용 변경만 isolate해서 Claude/Codex 영향 없이 되돌리기
- main 배포 후 문제 발생 시 직전 Gemini-stable commit으로 롤백
