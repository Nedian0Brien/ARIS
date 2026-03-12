# Plan: Happy Backend Alignment Procedure

**Generated**: 2026-03-12
**Estimated Complexity**: High

## Overview

목표는 ARIS 백엔드가 `references/happy`의 Claude 런타임 핵심 기능을 흡수해, 현재의 `happyClient.ts` 중심 CLI orchestration 구조에서 벗어나 `Session + launcher + scanner + protocol bridge + provider runtime` 구조로 정렬되는 것이다.

이 계획은 단순 리팩터링이 아니라 런타임 모델 정렬 작업이다. 따라서 파일 분리만이 아니라 세션 source of truth, 메시지 전송 형식, turn lifecycle, local/remote launcher 개념, provider boundary까지 함께 다룬다.

## Success Criteria

- Claude 런타임이 Happy와 같은 수준의 stateful session 모델을 가진다.
- `happyClient.ts`는 provider dispatch + storage bridge 중심으로 축소된다.
- Claude scanner는 watcher + tail + dedupe가 가능한 canonical source가 된다.
- Claude mapper는 session-protocol 중심 adapter가 된다.
- Claude local/remote launcher 분리가 도입되거나, 동일한 책임 분리가 ARIS 방식으로 재현된다.
- Codex/Gemini도 provider contract 관점에서 Claude와 일관된 구조를 가진다.

## Non-Goals

- 이번 계획 문서 자체에서 기능 구현까지 진행하지 않는다.
- 프론트 UI 변경은 범위에 포함하지 않는다.
- Happy 원본을 그대로 vendor-import 하지는 않는다.

## Prerequisites

- 직접 비교 기준:
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/claude/session.ts`
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/claude/claudeLocalLauncher.ts`
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/claude/claudeRemoteLauncher.ts`
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/claude/utils/sessionScanner.ts`
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts`
  - `/home/ubuntu/project/ARIS/references/happy/packages/happy-cli/src/api/apiSession.ts`
  - `/home/ubuntu/project/ARIS/references/happy/docs/session-protocol-claude.md`
- 현재 ARIS 주요 대상 파일:
  - `services/aris-backend/src/runtime/happyClient.ts`
  - `services/aris-backend/src/runtime/providers/claude/*`
  - `services/aris-backend/src/runtime/providers/providerCommandFactory.ts`
- 운영 검증 환경:
  - Claude CLI 인증이 정상
  - backend zero-downtime deploy 가능

## Sprint 1: Target Runtime Contract
**Goal**: Happy와 ARIS 사이의 핵심 개념 차이를 명시적 계약으로 고정한다.

**Demo/Validation**:
- 새 타입/인터페이스 문서만 보고 Claude runtime 책임을 설명할 수 있어야 함
- `happyClient.ts`에서 provider contract가 어디까지인지 경계가 분명해야 함

### Task 1.1: Claude Session Contract 정의
- **Location**: `services/aris-backend/src/runtime/providers/claude/types.ts`
- **Description**: Happy `Session`의 책임을 ARIS 타입으로 번역한다. `sessionId`, `mode`, `keepAliveState`, `sessionSource`, `turnState`, `oneTimeFlags`, `callbacks`를 포함한 계약을 정의한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - `ClaudeRuntimeSession` 외에 runtime-level session contract가 생긴다
  - session source와 turn lifecycle이 타입 레벨에서 드러난다
- **Validation**:
  - 타입만 읽어도 현재 synthetic/observed session 흐름을 설명할 수 있어야 함

### Task 1.2: Provider Runtime Contract 정의
- **Location**: `services/aris-backend/src/runtime/providers/`
- **Description**: Claude/Codex/Gemini가 공통으로 따라야 할 `sendTurn`, `abortTurn`, `recoverSession`, `isRunning` 계약을 정의한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - `happyClient.ts`가 provider-specific 구현 세부를 덜 알아도 되는 인터페이스가 생긴다
- **Validation**:
  - Claude와 Codex를 동일한 orchestration 관점으로 기술할 수 있어야 함

### Task 1.3: Session Protocol Boundary 정의
- **Location**: `services/aris-backend/src/runtime/` 또는 `providers/claude/`
- **Description**: Happy의 `SessionEnvelope`와 ARIS persisted message 사이의 중간 adapter contract를 설계한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - protocol-first 구조로 갈 때 어떤 이벤트 단위가 필요한지 문서화된다
- **Validation**:
  - `turn-start`, `turn-end`, `tool-call-start`, `tool-call-end`, `text`, `stop` 이벤트 목록이 고정된다

## Sprint 2: Session Owner 도입
**Goal**: 흩어진 Claude lifecycle 상태를 Happy식 session owner 객체로 통합한다.

**Demo/Validation**:
- Claude turn lifecycle의 source of truth가 하나의 객체에서 관리된다
- `happyClient.ts`가 직접 synthetic/resume/session callback을 조립하지 않는다

### Task 2.1: `ClaudeSession` 또는 동등 객체 추가
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeSession.ts`
- **Description**: Happy `Session`의 축소 번역판을 만든다. 현재 registry/controller/source/orchestrator에 흩어진 상태를 수용한다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - session id, mode, callback, one-time flag 소비가 한 객체에서 다뤄진다
- **Validation**:
  - unit test로 session id 변경/clear/flag consume 시나리오 검증

### Task 2.2: Registry/Controller를 Session Owner 기반으로 재편
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeSessionRegistry.ts`, `claudeSessionController.ts`
- **Description**: registry/controller가 단순 abort wrapper가 아니라 session owner lifecycle을 관리하도록 확장한다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - `(sessionId, chatId)` 단일 실행 보장과 session state transition이 연결된다
- **Validation**:
  - stale cleanup, overlapping turns, abort-after-start 테스트

### Task 2.3: Synthetic Session Bootstrap 축소
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeSessionSource.ts`
- **Description**: synthetic UUID를 기본 source로 쓰는 구조를 줄이고, observed/hook/scanner 값을 우선하는 정책으로 바꾼다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - synthetic id는 fallback 또는 bootstrap 보조값으로만 남는다
- **Validation**:
  - observed session id가 있으면 synthetic id가 다시 채택되지 않음

## Sprint 3: Local Launcher + Scanner Alignment
**Goal**: Happy local launcher와 session scanner의 핵심 기능을 ARIS에 흡수한다.

**Demo/Validation**:
- scanner가 watcher + tail + dedupe 기반으로 동작한다
- 같은 세션 파일 재읽기 시 중복 메시지가 다시 반영되지 않는다

### Task 3.1: SessionStart Hook 경로 설계
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy의 hook server와 동일하지 않더라도, Claude session id 발견을 비동기 callback으로 session owner에 전달하는 구조를 만든다.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - launcher spawn과 session id 발견이 느슨하게 결합된다
- **Validation**:
  - spawn 이후 session id가 바뀌는 케이스 테스트

### Task 3.2: `claudeSessionScanner.ts`를 watcher 기반으로 확장
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts`
- **Description**: Happy scanner처럼 file watcher, processed key dedupe, pending/current session 추적을 추가한다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - 새 line만 incremental 처리 가능
  - 동일 line 재처리 방지 가능
- **Validation**:
  - fixture 기반 watcher/dedupe/resume 테스트

### Task 3.3: Multi-session resume stitching
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts`
- **Description**: `--resume`, session fork, session change 이후에도 이전 세션과 새 세션 로그를 함께 추적할 수 있게 한다.
- **Dependencies**: Task 3.2
- **Acceptance Criteria**:
  - current/pending/finished session 개념이 구현된다
- **Validation**:
  - resumed session / forked session fixture 테스트

## Sprint 4: Session Protocol Adapter
**Goal**: ARIS Claude mapper를 Happy식 session-protocol adapter 수준으로 끌어올린다.

**Demo/Validation**:
- Claude raw event에서 turn/tool/text lifecycle 이벤트가 명시적으로 나온다
- persisted message는 protocol adapter를 거친 결과물로 생성된다

### Task 4.1: Protocol Envelope 타입 추가
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy의 `SessionEnvelope` 개념을 ARIS backend에서 사용할 수 있는 internal envelope 타입으로 정의한다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - mapper 출력이 text string이 아니라 envelope array가 된다
- **Validation**:
  - 타입 검증 및 fixture snapshot

### Task 4.2: `claudeProtocolMapper.ts` 재설계
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeProtocolMapper.ts`
- **Description**: 현재의 action/text/sessionId parser를 envelope mapper로 바꾼다. `turn-start`, `turn-end`, `tool-call-start`, `tool-call-end`, `text`, `stop`를 다룬다.
- **Dependencies**: Task 4.1, Sprint 3
- **Acceptance Criteria**:
  - mapper가 raw Claude event -> protocol envelopes를 반환한다
- **Validation**:
  - tool use / tool result / assistant text / result-only final / aborted turn 테스트

### Task 4.3: Sidechain/Subagent 모델 도입 여부 결정
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeProtocolMapper.ts`
- **Description**: Happy의 sidechain/subagent를 ARIS에 그대로 도입할지, 축소 모델로 갈지 결정하고 반영한다.
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - Task tool, orphan child, parent linkage 처리 방식이 문서화된다
- **Validation**:
  - Task/sidechain fixture 테스트

## Sprint 5: API Bridge와 Persisted Message 분리
**Goal**: Happy의 `ApiSessionClient.sendClaudeSessionMessage()`에 대응하는 backend adapter를 만든다.

**Demo/Validation**:
- protocol-first -> persisted-message projection 경로가 분리된다
- Claude 메시지 저장 로직이 `happyClient.ts`에서 빠진다

### Task 5.1: Claude Event Bridge 추가
- **Location**: `services/aris-backend/src/runtime/providers/claude/claudeEventBridge.ts`
- **Description**: protocol envelope를 ARIS `RuntimeMessage` 저장 포맷으로 투영하는 계층을 추가한다.
- **Dependencies**: Sprint 4
- **Acceptance Criteria**:
  - `appendAgentMessage()` 직접 호출 대신 bridge를 통해 tool/text가 저장된다
- **Validation**:
  - persisted message snapshot 테스트

### Task 5.2: `happyClient.ts`의 Claude persistence 제거
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`
- **Description**: Claude action append/text append/session hint 메타 조립을 provider bridge로 이동한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - `happyClient.ts`에서 Claude-specific message append 로직이 크게 줄어든다
- **Validation**:
  - git diff 기준 Claude-specific append helper 제거 확인

### Task 5.3: Metadata/Usage 반영 경로 분리
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy가 summary/usage를 API bridge에서 처리하듯, ARIS도 usage/session metadata 반영 경로를 분리한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - usage, summary, thread metadata 반영이 turn execution과 분리된다
- **Validation**:
  - usage/summary 테스트

## Sprint 6: Remote Path and Ordered Queue
**Goal**: Happy의 remote launcher 핵심 기능을 ARIS 방식으로 도입한다.

**Demo/Validation**:
- Claude remote stream 또는 equivalent path를 ordered queue를 통해 처리할 수 있다
- top-level tool call 지연/해제 같은 순서 제어가 가능하다

### Task 6.1: Remote-capable launcher 설계
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy `claudeRemoteLauncher.ts`를 참고해 ARIS에서 필요한 remote mode abstraction을 정의한다.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - local/remote launcher 분기 구조가 문서 또는 코드에 생긴다
- **Validation**:
  - launch mode selection 테스트

### Task 6.2: Ordered outgoing queue 추가
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy `OutgoingMessageQueue`와 같은 순서 보장 계층을 추가한다.
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - tool call delay/release semantics를 구현할 수 있다
- **Validation**:
  - ordering/release fixture 테스트

### Task 6.3: Permission response coupling 정리
- **Location**: `services/aris-backend/src/runtime/providers/claude/`
- **Description**: Happy remote path처럼 permission 결과와 message flush 타이밍을 연결한다.
- **Dependencies**: Task 6.2
- **Acceptance Criteria**:
  - permission 승인/거부가 message ordering과 일관되게 연결된다
- **Validation**:
  - permission flow integration test

## Sprint 7: `happyClient.ts` 해체와 Provider Symmetry
**Goal**: Claude에 맞춰 Codex/Gemini도 provider contract로 정리하고 `happyClient.ts`를 slim orchestrator로 만든다.

**Demo/Validation**:
- `happyClient.ts`가 provider dispatch + storage bridge + permission facade 역할만 가진다
- Codex/Gemini/Claude가 일관된 provider boundary를 가진다

### Task 7.1: Codex runtime extraction
- **Location**: `services/aris-backend/src/runtime/providers/codex/`
- **Description**: Codex app-server / exec runtime을 provider subtree로 이동한다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Codex 전용 대형 분기가 `happyClient.ts` 밖으로 빠진다
- **Validation**:
  - Codex app-server / exec regression test

### Task 7.2: Gemini runtime boundary 보강
- **Location**: `services/aris-backend/src/runtime/providers/gemini/`
- **Description**: 현재 launcher-only 수준인 Gemini를 runtime contract 수준으로 끌어올린다.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Gemini도 Claude/Codex와 같은 provider entrypoint를 가진다
- **Validation**:
  - Gemini command/runtime tests

### Task 7.3: `happyClient.ts` 최종 축소
- **Location**: `services/aris-backend/src/runtime/happyClient.ts`
- **Description**: provider dispatch, HTTP bridge, permission facade 중심으로 남기고 나머지 책임을 제거한다.
- **Dependencies**: Task 7.1, Task 7.2
- **Acceptance Criteria**:
  - `happyClient.ts` 라인 수와 책임이 크게 줄어든다
- **Validation**:
  - file responsibility review
  - backend test suite

## Sprint 8: E2E Rollout
**Goal**: 실제 Claude 채팅 기준으로 Happy 정렬 결과를 검증하고 운영 반영한다.

**Demo/Validation**:
- 새 채팅, 멀티턴, 빠른 재전송, 파일 읽기/쓰기, 명령 실행이 모두 정상
- session id 충돌과 action-card 오탐이 재현되지 않음

### Task 8.1: Claude E2E matrix 작성
- **Location**: `docs/` 또는 `services/aris-backend/tests/`
- **Description**: Claude 신규 세션, resume, tool use, abort, permission, sidechain 케이스를 matrix로 정의한다.
- **Dependencies**: Sprint 7
- **Acceptance Criteria**:
  - 운영 검증 체크리스트가 완성된다
- **Validation**:
  - 수동/자동 케이스 목록 점검

### Task 8.2: Staged deploy + smoke test
- **Location**: `deploy/`, 운영 체크리스트
- **Description**: 배포 후 2-turn / tool action / session continuity를 점검한다.
- **Dependencies**: Task 8.1
- **Acceptance Criteria**:
  - 운영 smoke test 통과
- **Validation**:
  - 실제 채팅과 로그 확인

### Task 8.3: Legacy compatibility path 제거
- **Location**: `services/aris-backend/src/runtime/`
- **Description**: 정렬 작업 중 남겨둔 임시 fallback, compatibility shim, synthetic session fallback을 정리한다.
- **Dependencies**: Task 8.2
- **Acceptance Criteria**:
  - 새 구조가 기본 경로가 된다
- **Validation**:
  - dead code review
  - backend full tests

## Testing Strategy

- 단위 테스트:
  - session owner lifecycle
  - scanner watcher/dedupe
  - protocol mapper envelope output
  - event bridge projection
  - launcher mode/queue ordering
- 통합 테스트:
  - Claude new session / resume / abort / permission / tool use
  - Codex/Gemini provider contract regression
- 운영 검증:
  - 2-turn Claude session continuity
  - file read/write/command action persistence
  - no duplicate action events

## Potential Risks & Gotchas

- `references/happy`는 nested repo + ignored path이므로 worktree에서 자동으로 따라오지 않는다.
- Claude CLI 인증 또는 upstream 로그인 장애가 있으면 E2E 판별이 왜곡될 수 있다.
- local/remote launcher split을 그대로 옮기면 ARIS의 현재 storage model과 충돌할 수 있다.
- session-protocol adapter를 도입하면 웹 normalizer와 저장 포맷도 일부 재검토가 필요할 수 있다.
- Codex extraction까지 포함하면 범위가 커지므로 Claude alignment 완료 후 Codex/Gemini를 이어 붙이는 단계 게이트가 필요하다.

## Rollback Plan

- 각 Sprint는 독립 브랜치/커밋으로 끝내고, 배포는 Sprint 단위로만 수행한다.
- Sprint 4 이전까지는 기존 persisted-message 경로를 fallback으로 유지한다.
- Sprint 5 이후 protocol-first 경로에 문제가 생기면 Claude provider만 legacy append path로 되돌릴 수 있도록 feature flag를 둔다.
- 운영 배포는 zero-downtime 기준으로 하고, smoke test 실패 시 직전 배포 버전으로 복귀한다.

## Recommended Execution Order

1. Sprint 1
2. Sprint 2
3. Sprint 3
4. Sprint 4
5. Sprint 5
6. Sprint 8의 일부 Claude E2E 선검증
7. Sprint 6
8. Sprint 7
9. Sprint 8 최종 정리
