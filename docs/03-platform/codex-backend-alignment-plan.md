# Plan: Codex Backend Alignment

**Generated**: 2026-03-12
**Estimated Complexity**: High

## Overview

Claude alignment 이후의 provider runtime 구조를 기준으로 Codex 런타임을 같은 경계로 정렬한다. 현재 Codex 경로는 [`happyClient.ts`](/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts)에 `app-server` JSON-RPC, `exec` JSONL, thread recovery, permission responder, streamed append가 함께 남아 있다. 목표는 이를 Codex provider subtree로 이동해 `happyClient`를 orchestration 중심으로 축소하고, thread continuity, permission wait, streamed persistence, fallback 정책을 테스트 가능한 단위로 고정하는 것이다.

## Prerequisites

- 기준 브랜치: `feat/codex-backend-alignment`
- 기준 구조: Claude alignment가 반영된 `providerRuntime`/`sessionProtocol`/provider subtree
- 검증 명령:
  - `cd services/aris-backend && npm run typecheck`
  - `cd services/aris-backend && npm test`
- 범위 밖:
  - Gemini alignment 구현
  - Codex CLI upstream protocol 변경 대응
  - main 병합 이후 배포 검증

## Sprint 1: Baseline Capture
**Goal**: 현재 Codex 런타임의 행위 기준선과 새 provider subtree 골격을 만든다.
**Demo/Validation**:
- Codex 관련 현재 동작이 테스트로 고정된다.
- provider subtree에 Codex 전용 파일 골격이 추가된다.

### Task 1.1: Codex 런타임 분해 지도 작성
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/docs/03-platform/codex-backend-alignment-plan.md`
- **Description**: `runCodexCliWithEvents`, `runCodexAppServerWithEvents`, `runCodexExecCliWithEvents`, thread recovery, permission maps, final append 경계를 정리해 migration map을 확정한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - app-server/exec/thread/permission/persistence 책임이 구분된다.
  - 후속 스프린트가 어느 함수/상태를 옮길지 명확해진다.
- **Validation**:
  - 계획 문서와 구현 대상 목록이 일치한다.

### Task 1.2: Codex provider subtree 골격 추가
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/contracts/providerRuntime.ts`
- **Description**: `types`, `codexRuntime`, `codexLauncher`, `codexSessionSource`, `codexPermissionBridge`, `codexEventBridge` 등 목표 파일 골격과 최소 타입을 추가한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - 새 파일들이 현재 contract와 import 경로에 맞게 컴파일된다.
  - `happyClient`가 새 subtree를 참조할 준비가 된다.
- **Validation**:
  - `npm run typecheck`

### Task 1.3: 현재 Codex 동작 기준 테스트 고정
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/tests/`
- **Description**: app-server resume, missing thread retry, exec permission parsing, duplicate agent message 방지, sanitizer 적용 지점을 재현하는 테스트를 추가한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - 이후 리팩터링 전후에 동일한 행위가 검증된다.
  - thread cache와 permission keying의 회귀 기준이 생긴다.
- **Validation**:
  - `npm test -- codex`

## Sprint 2: Session Ownership And Recovery
**Goal**: Codex thread source-of-truth를 `happyClient` 밖으로 이동한다.
**Demo/Validation**:
- `(sessionId, chatId)` scope에서 Codex thread continuity를 provider 쪽이 관리한다.
- 메시지 기반 recovery와 in-memory cache 정책이 테스트로 고정된다.

### Task 2.1: Codex session owner/registry/source 도입
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexSession.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexSessionRegistry.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexSessionSource.ts`
- **Description**: thread cache key, preferred thread resolution, observed/resumed thread 갱신, invalid thread purge를 Codex session owner로 옮긴다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - `happyClient`의 `codexThreads` 의존이 줄어든다.
  - missing thread 에러 시 purge/restart 정책이 provider 경계에서 처리된다.
- **Validation**:
  - `npm test -- codexSession`

### Task 2.2: recoverSession contract 연결
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/contracts/providerRuntime.ts`
- **Description**: `recoverSession()`이 stored thread id, message-derived thread id, in-memory observed thread id를 일관된 source metadata와 함께 반환하도록 만든다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - `threadIdSource`와 `source`가 Codex에도 의미 있게 채워진다.
  - `happyClient`에서 thread recovery 분기가 단순화된다.
- **Validation**:
  - `npm test -- runtimeContracts codexRuntime`

## Sprint 3: App-Server / Exec Runtime Extraction
**Goal**: Codex turn 실행 경로를 provider runtime으로 분리한다.
**Demo/Validation**:
- `codexRuntime.sendTurn()`이 app-server와 exec fallback을 모두 감싼다.
- `happyClient`는 Codex 전용 spawn/JSON-RPC 세부 구현을 직접 다루지 않는다.

### Task 3.1: app-server launcher/orchestrator 분리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexLauncher.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexAppServerRuntime.ts`
- **Description**: JSON-RPC 연결, `thread/start`, `thread/resume`, `turn/start`, timeout, stderr handling, initialized handshake를 별도 runtime으로 추출한다.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - app-server happy path와 strict mode 정책이 provider 파일로 이동한다.
  - `happyClient`에서 app-server 세부 메서드가 제거된다.
- **Validation**:
  - `npm test -- codexAppServer`

### Task 3.2: exec runtime 분리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexExecRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/providerCommandFactory.ts`
- **Description**: `exec --json` launch, stdout JSONL 처리, thread.started 반영, stderr/error normalization을 별도 runtime으로 옮긴다.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - exec path가 독립 테스트 가능해진다.
  - app-server 실패 시 exec fallback이 동일 contract 결과를 반환한다.
- **Validation**:
  - `npm test -- codexExecRuntime`

### Task 3.3: codexRuntime 통합
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
- **Description**: app-server strict/fallback 정책과 `isRunning`/`abortTurn`을 감싼 Codex provider runtime facade를 만든다.
- **Dependencies**: Task 3.1, Task 3.2
- **Acceptance Criteria**:
  - `happyClient`의 Codex 실행 진입점이 `sendTurn()` 호출 수준으로 줄어든다.
  - app-server strict mode와 missing thread retry가 유지된다.
- **Validation**:
  - `npm test -- codexRuntime happyClient`

## Sprint 4: Permission Bridge Alignment
**Goal**: Codex permission 생성과 승인 응답 경계를 provider runtime으로 이동한다.
**Demo/Validation**:
- app-server JSON-RPC approval과 exec JSON approval이 같은 provider permission request로 정규화된다.
- 승인 결정이 provider 경계에서 runtime responder로 되돌아간다.

### Task 4.1: Codex permission parser/bridge 추출
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexPermissionBridge.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
- **Description**: `exec_approval_request`, `apply_patch_approval_request`, legacy review, app-server approval methods를 provider permission request로 변환한다.
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - risk/reason/command/approvalId mapping이 테스트로 고정된다.
  - `happyClient`의 Codex approval parsing 헬퍼가 제거되거나 축소된다.
- **Validation**:
  - `npm test -- codexPermissionBridge`

### Task 4.2: responder lifecycle 분리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexPermissionRegistry.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
- **Description**: permission key dedupe, pending reuse, auto-approve(yolo), deny-on-cleanup 정책을 registry 수준으로 분리한다.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - `codexPermissionIndex`와 `codexPermissionResponders`가 `happyClient` 밖으로 이동한다.
  - permission wait 중 abort/deny 처리 일관성이 유지된다.
- **Validation**:
  - `npm test -- codexPermissionRegistry codexProviderFlow`

## Sprint 5: Protocol And Persistence Alignment
**Goal**: Codex streamed output을 envelope 기반으로 정규화하고 persisted projection을 분리한다.
**Demo/Validation**:
- app-server/exec 출력 모두 tool/text/run-status 경계가 provider 단위로 해석된다.
- sanitizer와 duplicate suppression이 queue/bridge 경계에서 일관되게 동작한다.

### Task 5.1: Codex protocol mapper 도입
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexProtocolMapper.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/contracts/sessionProtocol.ts`
- **Description**: app-server notifications와 exec JSON items를 `turn-start`, `tool-call-start`, `tool-call-end`, `text`, `turn-end`, `stop` 등 session protocol envelope로 정규화한다.
- **Dependencies**: Sprint 4
- **Acceptance Criteria**:
  - app-server와 exec가 같은 downstream persistence 경로를 공유한다.
  - thread id, turn id, stop reason, tool call id가 일관되게 채워진다.
- **Validation**:
  - `npm test -- codexProtocolMapper`

### Task 5.2: Codex event bridge / message queue 도입
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexEventBridge.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexMessageQueue.ts`
- **Description**: envelope를 persisted tool/text message로 투영하고, tool action과 final text 저장 순서를 queue로 직렬화한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - final text 저장 전에 sanitizer가 적용된다.
  - duplicate agent message suppression과 streamed/final append 정책이 테스트로 고정된다.
- **Validation**:
  - `npm test -- codexEventBridge codexMessageQueue`

## Sprint 6: Happy Client Integration
**Goal**: `happyClient`의 Codex 전용 로직을 orchestration 수준으로 줄인다.
**Demo/Validation**:
- `happyClient`는 Codex provider runtime 호출, generic permission facade, final persistence wiring만 담당한다.
- Codex-specific maps와 giant method가 크게 축소된다.

### Task 6.1: happyClient Codex branch 교체
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
- **Description**: inline Codex turn 실행, recovery, permission, persistence 분기를 provider runtime 호출과 generic helper 조합으로 교체한다.
- **Dependencies**: Sprint 5
- **Acceptance Criteria**:
  - `happyClient`에서 Codex private method 다수가 제거된다.
  - run lifecycle event와 store append 결과가 기존과 호환된다.
- **Validation**:
  - `npm test -- happyClient codexProviderFlow`

### Task 6.2: launch mode / runtime metadata 정리
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/happyClient.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/src/runtime/providers/codex/types.ts`
- **Description**: app-server vs exec channel, model reasoning effort, thread source, runtime mode를 persisted meta와 runtime result에 명시적으로 남긴다.
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - 분석/디버깅 시 어떤 Codex path가 실행됐는지 메시지 메타로 추적 가능하다.
  - `app-server-strict`/fallback 동작을 테스트가 설명한다.
- **Validation**:
  - `npm test -- happyClient.streamJson codexRuntime`

## Sprint 7: E2E And Merge Readiness
**Goal**: Codex alignment를 운영 기준선까지 검증하고 merge 준비를 마친다.
**Demo/Validation**:
- Codex alignment E2E와 수동 검증 매트릭스가 문서화된다.
- `#82` 이슈에 스프린트별 결과와 리스크가 누적된다.

### Task 7.1: Codex alignment E2E 작성
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/services/aris-backend/tests/codexAlignment.e2e.test.ts`
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/docs/03-platform/codex-happy-alignment-e2e-matrix.md`
- **Description**: app-server happy path, exec fallback, permission wait/decision, tool ordering, thread continuity, sanitizer 적용을 한 번에 검증한다.
- **Dependencies**: Sprint 6
- **Acceptance Criteria**:
  - 자동 검증 범위와 수동 검증 범위가 분리되어 문서화된다.
  - `happyClient` 리팩터링 후에도 Codex user-visible behavior가 유지된다.
- **Validation**:
  - `npm test -- codexAlignment.e2e.test.ts`

### Task 7.2: merge readiness 점검
- **Location**:
  - `/home/ubuntu/project/ARIS/.worktrees/codex-backend-alignment/`
- **Description**: 최신 `origin/main` 충돌 가능 구간, Claude regression, 실제 Codex CLI smoke check 항목을 정리하고 PR 준비를 마친다.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - 리뷰어가 `happyClient` 축소 결과와 Codex subtree 추가를 쉽게 따라갈 수 있다.
  - 수동 검증이 필요한 항목이 명확히 남는다.
- **Validation**:
  - `npm run typecheck`
  - `npm test`

## Testing Strategy

- 스프린트마다 단위 테스트와 통합 테스트를 함께 추가한다.
- app-server와 exec 경로는 같은 입력을 서로 다른 transport로 처리한다는 점을 교차 검증한다.
- 필수 회귀 범위:
  - missing thread retry
  - pending permission reuse
  - deny/abort during permission wait
  - duplicate agent message suppression
  - sanitizer 적용 후 final text persistence
  - thread continuity across multi-turn chat
- Claude 관련 기존 E2E와 전체 테스트를 매 스프린트 후 함께 실행해 symmetry 작업의 회귀를 방지한다.

## Potential Risks & Gotchas

- Codex는 Claude와 달리 `app-server`와 `exec`가 동시에 운영 경로이므로, 한쪽만 기준으로 설계하면 fallback semantics가 깨질 수 있다.
- app-server JSON-RPC approval method와 exec JSON approval item이 완전히 같지 않아서 bridge가 과도하게 일반화되면 risk mapping이 틀어질 수 있다.
- 기존 `happyClient`는 persisted message side-effect와 runtime control-flow가 강하게 결합되어 있어, 추출 중 duplicate append나 lifecycle event 누락이 발생할 수 있다.
- thread recovery는 in-memory cache, stored message meta, runtime-observed thread가 섞여 있어 source priority를 명확히 정하지 않으면 continuity regression이 생길 수 있다.
- 실제 Codex CLI protocol 변화 가능성이 있으므로 fixture 기반 테스트와 실제 smoke check를 분리해야 한다.

## Rollback Plan

- 각 스프린트는 작은 커밋 단위로 나누어 provider subtree 추가와 `happyClient` 호출 전환을 분리한다.
- app-server extraction 중 문제가 생기면 `codexRuntime` 내부에서 기존 inline flow를 임시 adapter로 감싼 상태로 되돌릴 수 있게 유지한다.
- merge 직전까지는 Claude runtime과 Codex runtime을 독립 테스트로 검증하고, Codex E2E 실패 시 provider wiring 커밋만 선택적으로 revert 가능하도록 만든다.
