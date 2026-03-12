# Claude Session Identity Boundary

## 목적

Claude runtime에서 ARIS 내부 correlation id와 Claude provider session id의 경계를 명확히 고정한다.

## 원칙

- ARIS는 Claude fresh turn 시작 시 `--session-id`를 주입하지 않는다.
- Claude continuity가 필요할 때만 실제 observed/stored Claude session id로 `--resume`를 사용한다.
- synthetic id는 ARIS 내부 correlation 용도로만 사용한다.
- synthetic id는 durable `claudeSessionId`로 저장하거나 recovery source로 사용하지 않는다.

## 이유

기존 구조는 fresh turn에서 deterministic synthetic UUID를 만들고 이를 Claude CLI `--session-id`로 넘겼다. 이 값은 실제 Claude가 발급한 session id가 아니라 ARIS가 임시로 만든 bootstrap 값이다. 이 bootstrap 값이 persisted message와 recovery 경로에 섞이면서 다음 문제가 발생했다.

- synthetic id가 실제 Claude session처럼 복구됨
- stale process 또는 중복 launch 상황에서 `Session ID ... is already in use` 충돌 발생
- session source-of-truth가 observed id보다 bootstrap id에 끌려감

## 현재 동작

- fresh Claude turn:
  - `--resume` 없음
  - synthetic id는 내부 action/thread correlation 용도로만 사용
- resumed Claude turn:
  - stored 또는 observed Claude session id가 있으면 `--resume <id>` 사용
- persisted meta:
  - `threadIdSource=synthetic`는 내부 correlation 의미만 가진다
  - `claudeSessionId`는 observed/resume source일 때만 저장한다

## 구현 기준

- [`claudeSessionSource.ts`](/home/ubuntu/project/ARIS/.worktrees/fix-claude-session-id-in-use/services/aris-backend/src/runtime/providers/claude/claudeSessionSource.ts)
- [`claudeLauncher.ts`](/home/ubuntu/project/ARIS/.worktrees/fix-claude-session-id-in-use/services/aris-backend/src/runtime/providers/claude/claudeLauncher.ts)
- [`claudeOrchestrator.ts`](/home/ubuntu/project/ARIS/.worktrees/fix-claude-session-id-in-use/services/aris-backend/src/runtime/providers/claude/claudeOrchestrator.ts)

## 후속 방향

- 가능하면 synthetic correlation id도 persisted message의 일반 `threadId`와 분리해 `localCorrelationId` 같은 별도 메타로 내리는 것을 검토한다.
- Claude가 더 이른 시점에 canonical session id를 노출하는 hook을 안정적으로 제공하면 synthetic 역할을 더 줄인다.
