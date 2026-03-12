# Plan: Gemini Backend Alignment

**Generated**: 2026-03-13
**Estimated Complexity**: High

## Overview

Claude alignment 이후의 `providerRuntime` 경계와 Happy의 검증된 session/runtime 원칙을 기준으로 Gemini 런타임을 정렬한다. 현재 Gemini 경로는 [`geminiLauncher.ts`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiLauncher.ts)와 [`providerCommandFactory.ts`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/providerCommandFactory.ts)에 launcher 수준만 존재하고, 실제 turn 실행, streamed parsing, persistence, timeout, recovery는 대부분 [`happyClient.ts`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts)의 generic path에 남아 있다. 목표는 Gemini를 Claude와 같은 provider subtree 구조로 끌어올리되, Codex는 건드리지 않고, provider identity와 local correlation key를 처음부터 분리하는 것이다.

## Guiding Invariants

- 상위 레이어는 Gemini raw payload key shape를 직접 알지 않는다.
- provider identity와 local correlation key는 절대로 같은 값으로 취급하지 않는다.
- fresh Gemini turn은 synthetic/provider-supplied 임시 id 주입에 의존하지 않는다.
- 실제 observed session or thread id가 발견되면 실패 turn에서도 보존된다.
- protocol mapper와 scanner or recovery path는 같은 canonical session identity를 도출해야 한다.
- timeout 정책은 절대 wall-clock보다 activity and permission wait 상태를 기준으로 다뤄야 한다.

## Current State Snapshot

- Gemini CLI 진입점은 [`geminiLauncher.ts`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiLauncher.ts) 하나뿐이다.
- `--output-format stream-json`과 optional `--resume`만 provider 경계에 있고, 나머지 parsing/persistence는 generic helper에 남아 있다.
- [`happyClient.ts`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts)의 `parseAgentStreamLine()`과 `parseAgentStreamOutput()`가 Gemini raw output도 함께 처리한다.
- Gemini 전용 session owner, protocol mapper, permission bridge, event bridge, message queue, conformance fixture가 없다.
- 최근 Claude에서 겪은 `sessionid` key variation, synthetic identity leakage, absolute timeout 문제를 Gemini는 아직 구조적으로 방지하지 못한다.

## Status Snapshot

- 완료:
  - Sprint 1의 identity boundary 문서화와 resume target 경계 테스트 고정
  - Sprint 2의 provider subtree skeleton, session source, registry, `recoverSession()` 최소 계약 추가
  - Sprint 3의 protocol fields helper, mapper, conformance fixture 추가
- 다음 우선순위:
  1. Sprint 4로 runtime extraction과 timeout policy 분리
  2. Sprint 5로 event bridge, queue, persistence alignment 진행
  3. Sprint 6에서 permission capability 조사와 lifecycle 정리
- 보류 판단 필요:
  - Gemini CLI가 permission or tool-confirmation 이벤트를 실제로 노출하는지
  - Gemini observed identity가 stdout line 외 다른 경로로 나오는지

## Prerequisites

- 기준 브랜치: `feat/gemini-backend-alignment`
- 기준 커밋: `f916669`
- 참고 구현:
  - Claude provider subtree
  - [`claude-session-identity-boundary.md`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/claude-session-identity-boundary.md)
  - [`claude-protocol-conformance.md`](/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/claude-protocol-conformance.md)
- 검증 명령:
  - `cd services/aris-backend && npm run typecheck`
  - `cd services/aris-backend && npm test`
- 범위 밖:
  - Codex 리팩터링
  - Gemini upstream CLI 자체 변경 대응
  - `main` 병합 이후 배포 smoke test 자동화

## Sprint 1: Baseline Capture And Identity Boundary
**Goal**: 현재 Gemini 동작 기준선과 identity boundary를 먼저 고정한다.
**Demo/Validation**:
- Gemini 현재 동작이 테스트로 고정된다.
- provider identity vs local correlation 정책이 문서와 테스트 이름으로 명시된다.

### Task 1.1: Gemini migration map 작성
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/gemini-backend-alignment-plan.md`
- **Description**: Gemini 관련 generic parsing, resume handling, timeout, streamed append, error normalization이 어느 경계로 이동해야 하는지 함수 단위로 분해한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - 현재 generic path 중 Gemini에 실제로 필요한 책임이 구분된다.
  - Claude와 공유 가능한 helper, Gemini 전용 adapter 책임이 분리된다.
- **Validation**:
  - 계획 문서와 대상 함수 목록이 일치한다.

### Task 1.2: identity boundary 문서화
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/gemini-session-identity-boundary.md`
- **Description**: provider identity, observed session, stored resume target, local correlation key를 구분하는 규칙을 문서화한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Gemini는 synthetic or local id를 provider `--resume` or future session flag로 주입하지 않는다는 원칙이 명시된다.
  - 이후 스프린트 테스트가 참조할 불변식 문장이 정리된다.
- **Validation**:
  - 문서와 테스트 이름이 같은 불변식을 사용한다.

### Task 1.3: baseline 테스트 고정
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/tests/`
- **Description**: current Gemini happy path, `--resume` path, stream-json fallback, timeout budget, raw stream parsing 기대값을 테스트로 고정한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - 이후 리팩터링 전후 behavior regression 기준이 생긴다.
  - Claude에서 놓쳤던 failure and variation 경로를 초기부터 테스트에 포함한다.
- **Validation**:
  - `npm test -- providerCommandFactory happyClient.streamJson`

## Sprint 2: Provider Subtree Skeleton And Session Ownership
**Goal**: Gemini source of truth를 `happyClient` 밖으로 이동할 최소 골격을 만든다.
**Demo/Validation**:
- Gemini provider subtree가 컴파일된다.
- future session continuity를 담을 owner and registry가 생긴다.

### Task 2.1: Gemini provider subtree 추가
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/`
- **Description**: `types`, `geminiRuntime`, `geminiSession`, `geminiSessionRegistry`, `geminiSessionSource`, `geminiProtocolMapper`, `geminiEventBridge` 골격과 최소 타입을 추가한다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - import graph가 현재 contract와 맞게 정리된다.
  - `happyClient`가 Gemini subtree를 참조할 준비가 된다.
- **Validation**:
  - `npm run typecheck`

### Task 2.2: recoverSession contract 연결
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/contracts/providerRuntime.ts`
- **Description**: stored resume id, observed runtime id, message-derived id를 일관된 metadata와 함께 반환하는 Gemini `recoverSession()`을 도입한다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - `source`, `threadIdSource`, `resumeTarget` 해석이 provider 경계에서 이뤄진다.
  - 상위 레이어가 Gemini raw key를 직접 몰라도 된다.
- **Validation**:
  - `npm test -- runtimeContracts`

## Sprint 3: Protocol Normalization And Conformance
**Goal**: Gemini raw output을 canonical envelope로 정규화한다.
**Demo/Validation**:
- raw line variation이 adapter 내부에서 흡수된다.
- 실제 trace fixture 기반 conformance test가 생긴다.

### Task 3.1: Gemini protocol fields helper 도입
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiProtocolFields.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiProtocolMapper.ts`
- **Description**: raw `sessionId`, `session_id`, `threadId`, `thread_id`, stop reason, tool ids, text fields를 한 곳에서 canonical value로 해석한다.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - 상위 코드에서 Gemini key variation을 직접 다루지 않는다.
  - key normalization 수정 지점이 한 파일로 축소된다.
- **Validation**:
  - `npm test -- geminiProtocolMapper`

### Task 3.2: trace fixture 기반 conformance test 작성
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/tests/geminiProtocolConformance.test.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/tests/fixtures/gemini/`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/gemini-protocol-conformance.md`
- **Description**: success, init-only, timeout, abort, permission wait, key variation trace를 fixture로 저장하고 canonical envelope 결과를 고정한다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Happy invariant가 테스트 이름에 명시된다.
  - raw trace change가 adapter regression으로 바로 드러난다.
- **Validation**:
  - `npm test -- geminiProtocolConformance`

## Sprint 4: Runtime Extraction And Timeout Policy
**Goal**: Gemini turn 실행과 timeout 정책을 provider runtime으로 끌어낸다.
**Demo/Validation**:
- `sendTurn()`이 Gemini launch and stream processing을 감싼다.
- timeout이 activity 기반으로 정리된다.

### Task 4.1: Gemini runtime facade 도입
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiLauncher.ts`
- **Description**: command build, spawn, stdout/stderr handling, retry args, observed id capture, normalized error handling을 provider runtime으로 이동한다.
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - `happyClient`는 Gemini spawn 세부 구현을 직접 다루지 않는다.
  - exit code and timeout normalization이 provider 단위에서 설명된다.
- **Validation**:
  - `npm test -- geminiRuntime`

### Task 4.2: Gemini timeout budget and activity policy 정리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
- **Description**: Gemini가 generic CLI timeout을 그대로 써도 되는지 검증하고, 필요하면 provider-specific timeout budget and activity reset 정책을 도입한다.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - 긴 Gemini turn이 absolute timeout 때문에 잘리지 않는다.
  - permission or long-running tool 상태가 있다면 timeout suspension 규칙이 명시된다.
- **Validation**:
  - `npm test -- happyClient.streamJson geminiRuntime`

## Sprint 5: Event Bridge And Persistence Alignment
**Goal**: Gemini output persistence를 provider 경계로 정규화한다.
**Demo/Validation**:
- tool and text projection이 envelope 기반으로 저장된다.
- sanitizer and duplicate suppression이 provider bridge에서 일관되게 동작한다.

### Task 5.1: Gemini event bridge and message queue 추가
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiEventBridge.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiMessageQueue.ts`
- **Description**: protocol envelope를 persisted tool and text message로 투영하고 저장 순서를 직렬화한다.
- **Dependencies**: Sprint 4
- **Acceptance Criteria**:
  - tool text ordering이 테스트로 고정된다.
  - final text는 sanitizer 뒤에 저장된다.
- **Validation**:
  - `npm test -- geminiEventBridge geminiMessageQueue`

### Task 5.2: generic append path 축소
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
- **Description**: Gemini-specific append, thread meta persistence, stop reason 반영을 generic path 밖으로 이동한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - `happyClient`는 orchestration and generic persistence hook 수준으로 줄어든다.
  - provider-specific append 분기가 더 이상 Gemini raw payload를 직접 다루지 않는다.
- **Validation**:
  - `npm test -- happyClient`

## Sprint 6: Permission And Tool Lifecycle
**Goal**: Gemini가 approval or tool-interrupt 성격의 이벤트를 내는 경우를 provider contract로 흡수한다.
**Demo/Validation**:
- permission-like event가 generic provider permission facade로 연결된다.
- abort and deny handling이 provider lifecycle에 묶인다.

### Task 6.1: Gemini permission capability 조사와 bridge 설계
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/gemini-backend-alignment-plan.md`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/`
- **Description**: Gemini CLI가 approval or tool confirmation 이벤트를 노출하는지 실제 trace 기준으로 확인하고, 있으면 `geminiPermissionBridge`와 registry를 설계한다. 없으면 명시적으로 out-of-scope로 문서화한다.
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - capability gap이 추측이 아니라 trace and docs 근거로 정리된다.
  - permission contract 적용 여부가 명확해진다.
- **Validation**:
  - 계획 문서와 테스트에 capability status가 반영된다.

### Task 6.2: abort and cleanup contract 정리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiSessionRegistry.ts`
- **Description**: running turn abort, stale session cleanup, observed id retention on failure를 provider lifecycle로 묶는다.
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - 실패 turn 이후에도 observed identity가 사라지지 않는다.
  - abort 후 stale state 정리가 provider 단위에서 일관된다.
- **Validation**:
  - `npm test -- geminiProviderFlow`

## Sprint 7: Happy Client Integration And E2E
**Goal**: `happyClient`에서 Gemini 전용 로직을 orchestration 수준으로 줄이고 merge 준비를 마친다.
**Demo/Validation**:
- `happyClient`는 Gemini provider runtime 호출과 generic lifecycle만 남긴다.
- E2E and manual matrix가 merge 기준선을 제공한다.

### Task 7.1: happyClient Gemini branch 교체
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
- **Description**: inline Gemini generic turn path를 provider runtime 호출과 normalized result contract 조합으로 교체한다.
- **Dependencies**: Sprint 6
- **Acceptance Criteria**:
  - Gemini-specific parsing and state handling이 `happyClient`에서 크게 줄어든다.
  - non-Gemini generic path와 책임 경계가 분명해진다.
- **Validation**:
  - `npm test -- happyClient geminiRuntime`

### Task 7.2: Gemini alignment E2E와 운영 검증 매트릭스 작성
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/services/aris-backend/tests/geminiAlignment.e2e.test.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/gemini-backend-alignment/docs/03-platform/gemini-happy-alignment-e2e-matrix.md`
- **Description**: resume continuity, long turn timeout, tool ordering, observed identity retention, failure normalization을 한 번에 검증한다.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - 자동 검증과 수동 검증 범위가 문서화된다.
  - `#87` 이슈에 스프린트별 결과와 리스크가 누적된다.
- **Validation**:
  - `npm test -- geminiAlignment.e2e`

## Merge Readiness Checklist

- `providerRuntime` contract가 Gemini에도 일관되게 적용된다.
- provider identity vs local correlation 분리가 코드와 테스트에 반영된다.
- Gemini raw payload key variation은 adapter helper에서만 처리된다.
- 성공, 실패, timeout, abort trace fixture가 존재한다.
- `happyClient`는 Gemini provider subtree 호출 중심으로 축소된다.
- 스프린트 완료 시마다 `#87`에 결과와 남은 리스크를 댓글로 남긴다.

## Testing Strategy

- Sprint 2:
  - `npm run typecheck`
  - `npm test -- runtimeContracts`
- Sprint 3:
  - fixture 기반 `geminiProtocolMapper` and `geminiProtocolConformance` 테스트
  - 실제 Gemini trace sample을 fixture에 추가할 때 mapper 결과 비교
- Sprint 4:
  - runtime happy path, timeout, retry, failure normalization 테스트
  - 긴 turn 시나리오에 대한 activity-driven timeout 검증
- Sprint 5:
  - event bridge, queue ordering, sanitizer, duplicate suppression 테스트
- Sprint 6:
  - permission capability가 있으면 bridge and lifecycle 테스트
  - capability가 없으면 out-of-scope 문서화와 abort cleanup 테스트
- Sprint 7:
  - `geminiAlignment.e2e.test.ts`
  - 수동 매트릭스로 resume continuity, long turn, failure recovery 확인

## Potential Risks And Gotchas

- Gemini CLI raw payload shape가 버전별로 다를 수 있다.
  - 대응: trace fixture와 protocol fields helper로 변형을 adapter 내부에 가둔다.
- Gemini가 Claude처럼 명확한 observed session id를 항상 주지 않을 수 있다.
  - 대응: `recoverSession()`은 stored, observed, message-derived source를 구분해 메타로 남긴다.
- timeout 정책을 generic path에서 바로 떼어내면 다른 agent와 책임이 섞일 수 있다.
  - 대응: Sprint 4 전에는 Gemini-specific timeout 정책을 runtime facade 안에서만 추가한다.
- permission capability가 없는데 Claude와 같은 구조를 억지로 맞추면 불필요한 추상화가 생긴다.
  - 대응: Sprint 6에서 capability 조사 후 in-scope 여부를 결정한다.
- `happyClient`에서 generic parser를 너무 빨리 걷어내면 Gemini baseline이 깨질 수 있다.
  - 대응: Sprint 3 conformance fixture와 Sprint 5 queue 테스트가 생기기 전에는 parser 제거를 미룬다.

## Rollback Plan

- 각 sprint는 독립 커밋으로 유지한다.
- Gemini provider subtree가 불안정하면 해당 스프린트 커밋만 되돌리고 기존 generic path를 유지한다.
- runtime extraction 이후 regression이 크면 `happyClient`의 기존 generic path를 feature-flag 성격의 fallback으로 잠시 남긴다.
- `main` 병합 전에는 최신 `origin/main` 기준으로 rebase or merge validation을 다시 수행한다.
