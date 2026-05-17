# Symphony 오케스트레이션 참고 분석

- 원본 저장소: https://github.com/openai/symphony
- 로컬 클론 경로: `/home/ubuntu/project/ARIS/references/symphony`
- 참고 커밋: `bbef62364db25970cf0e732fc61011ab753d2604`
- 분석 일자: 2026-05-17
- 후속 추적 이슈: https://github.com/Nedian0Brien/ARIS/issues/353

## 결론

Symphony는 ARIS에 그대로 포팅할 라이브러리라기보다, 작업 단위 에이전트 실행을 어떻게 오케스트레이션할지 보여주는 규격과 참조 구현에 가깝다. Elixir 구현은 구조를 검증하는 데 유용하지만, ARIS에는 이미 주요 하위 계층이 있다. provider runtime, Codex app-server 연결, 권한 라우팅, 실시간 이벤트, Prisma 기반 세션 저장소, Project Chat, 세션별 worktree 지원이 이미 존재한다.

따라서 ARIS에 가장 가치 있는 도입 방향은 기존 runtime 위에 얇은 ARIS 네이티브 작업 오케스트레이션 계층을 추가하는 것이다. 이 계층은 추적 가능한 작업 항목을 격리된 worktree 안에서 제한된 동시성, 관측 가능성, 재시도 정책을 가진 에이전트 실행으로 바꾸는 역할을 맡아야 한다.

## 관련 ARIS 기준점

- 런타임 실행: `services/aris-backend/src/runtime/runtimeCore.ts`
- Codex app-server 통합: `services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
- active run 관리: `services/aris-backend/src/runtime/orchestration/activeRunRegistry.ts`
- 권한 라우팅: `services/aris-backend/src/runtime/orchestration/permissionRouter.ts`
- 런타임 저장소: `services/aris-backend/src/runtime/prismaStore.ts`
- run 저장 스키마: `services/aris-backend/prisma/schema.prisma` (`SessionRun`, `SessionChatEvent`)
- Project Chat 화면: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- 기존 참고 패턴: `docs/dev_report/tessera-parallel-workspace-reference.md`

## 도입 후보

### 1. ARIS Work-Item Orchestrator

우선순위: 높음

Symphony의 핵심은 하나의 권위 있는 오케스트레이터가 대상 작업을 폴링하고, claim하고, 에이전트에 dispatch하고, 실패 시 재시도하고, 상태 변화를 reconcile하며, 운영자가 볼 수 있는 상태를 제공한다는 점이다. ARIS에는 현재 active run 추적과 chat 단위 runtime state는 있지만, background work dispatcher가 1급 개념으로 존재하지 않는다.

ARIS에 맞는 방향:

- Linear에 묶이지 않는 `WorkItem` 추상화를 추가한다. 초기 adapter는 GitHub Issues와 ARIS project chat으로 시작할 수 있고, Linear는 선택 사항으로 둔다.
- 오케스트레이터 상태는 작고 명시적으로 유지한다: `running`, `claimed`, `retrying`, `completed`, `last_event_at`, `attempt`.
- 별도 job engine을 먼저 만들기보다 기존 `SessionRun` / `SessionChatEvent` 경로에 durable run 사실을 저장한다.
- 처음에는 `max_concurrent_agents=1` 또는 project-scoped limit으로 시작하고, 관측성이 충분해진 뒤 확장한다.

### 2. 저장소 소유 Workflow 계약

우선순위: 높음

Symphony는 YAML front matter와 prompt body를 가진 `WORKFLOW.md`를 사용한다. ARIS에는 강한 프로젝트 지침인 `AGENTS.md`가 있지만, poll cadence, work source, worktree 규칙, max turns, retry backoff, 모델 기본값, 검증 정책을 runtime이 읽을 수 있는 계약 파일은 아직 없다.

ARIS에 맞는 방향:

- `.aris/workflows/default.md` 또는 `ARIS_WORKFLOW.md`를 도입한다.
- YAML front matter는 오케스트레이션 설정으로 해석하고, Markdown body는 work-item prompt template로 사용한다.
- 이후 실행에는 dynamic reload를 지원하되, 이미 실행 중인 turn의 설정은 안정적으로 유지한다.
- `AGENTS.md`를 대체하지 않는다. workflow 파일은 runtime configuration과 prompt assembly 계약으로 둔다.

### 3. 결정적 Worktree Lifecycle

우선순위: 높음

Symphony는 issue identifier에서 결정적으로 workspace 경로를 만들고 path-safety 검사를 강제한다. ARIS에도 worktree helper가 있지만, runtime이 만든 worktree 경로는 현재 작업 항목 기준이라기보다 session/branch 기준에 가깝다.

ARIS에 맞는 방향:

- sanitized work item identifier를 기준으로 설정된 root 아래에 오케스트레이션 worktree 경로를 만든다.
- ARIS 전용 `after_create` hook으로 `scripts/create_worktree_with_shared_node_modules.sh`를 재사용한다.
- dependency sync, cleanup, validation을 위해 선택적 `before_run`, `after_run`, `before_remove` hook을 추가한다.
- 성공한 run의 worktree는 merge/cleanup 정책이 명시적으로 실행되기 전까지 보존한다.

### 4. 읽기 전용 Orchestrator Snapshot API

우선순위: 중상

Symphony의 snapshot/status surface는 UI 추론이 아니라 오케스트레이터 상태에서 직접 나온다는 점이 가치 있다. ARIS에는 이미 realtime WebSocket event가 있지만, project 단위에서 "지금 시스템이 무엇을 하고 있는가"를 압축해 보여주는 endpoint가 있으면 운영성이 좋아진다.

ARIS에 맞는 방향:

- `/v1/orchestrator/snapshot` 같은 읽기 전용 backend endpoint를 추가한다.
- running work item, retry queue, attempt count, last event summary, token total, rate-limit data, model, branch, worktree path를 포함한다.
- 웹 UI에서는 별도 terminal-style dashboard를 만들기보다 Project Chat 내부의 작은 operations panel로 노출한다.
- 초기에는 read-only로 둔다. refresh 같은 운영 trigger는 나중에 추가한다.

### 5. Auto-Continuation Turn

우선순위: 중상

Symphony는 추적 중인 issue가 active 상태로 남아 있으면 같은 Codex thread에서 계속 이어서 실행한다. 첫 turn에는 전체 prompt를 보내고, 이후 turn에는 짧은 continuation guidance만 보낸다. ARIS도 thread ID를 추적하고 Codex app-server session을 resume할 수 있다.

ARIS에 맞는 방향:

- Project Chat에 `max_turns`를 가진 "끝날 때까지 실행" 모드를 추가한다.
- 첫 turn은 렌더링된 전체 work-item prompt를 받는다.
- 이후 turn은 간결한 continuation guidance만 보내고 기존 thread context를 활용한다.
- terminal state, 명시적 abort, permission 누락, max-turn exhaustion에서 멈춘다.

### 6. 작업 추적용 Scoped Dynamic Tool

우선순위: 중간

Symphony는 `linear_graphql`이라는 좁은 dynamic tool을 주입해 agent가 tracker를 갱신할 수 있게 한다. 중요한 점은 orchestrator 자체가 tracker write business layer가 되지 않는다는 것이다. ARIS는 Codex approval과 MCP elicitation은 처리하지만, `thread/start`에서 ARIS 전용 dynamic tool을 광고하지는 않는다.

ARIS에 맞는 방향:

- 현재 작업 항목의 상태와 progress note를 읽고 갱신하는 `aris_work_item` 같은 scoped tool 하나로 시작한다.
- GitHub Issues가 첫 adapter가 된다면 현재 issue에 필요한 최소 issue/comment operation만 노출한다.
- tool access는 현재 작업 항목과 현재 repository 범위로 제한한다.
- 지원하지 않는 tool request는 run을 멈추게 두지 말고 구조화된 실패 응답을 반환한다.

### 7. Token Accounting Semantics

우선순위: 중간

Symphony는 Codex app-server token accounting을 꽤 조심스럽게 문서화한다. live thread token event에는 누적 total과 최신 delta가 다른 의미로 들어온다. ARIS에는 context usage UI가 있지만, backend 검색 기준으로는 robust token-usage pipeline이 아직 뚜렷하지 않았다.

ARIS에 맞는 방향:

- `thread/tokenUsage/updated`를 파싱하고, event type과 payload path 기준으로 total과 delta를 구분한다.
- thread/run별 최신 absolute total을 저장한다.
- context window는 spend와 별도로 표시한다.
- runaway run을 볼 수 있도록 token total을 orchestrator snapshot에 포함한다.

### 8. Remote Worker Extension

우선순위: 낮음

Symphony에는 선택적 SSH worker model이 포함되어 있다. 하지만 ARIS에서는 local work-item orchestrator가 안정화되기 전까지 도입하지 않는 편이 낫다.

ARIS에 맞는 방향:

- 이 항목은 이후 scale-out 트랙으로 보류한다.
- 나중에 도입한다면 동일 snapshot model 안에 worker host, workspace path, host capacity를 함께 노출한다.

## 도입하지 않을 것

- Elixir/Phoenix 서비스를 ARIS에 포팅하지 않는다. 기존 TypeScript backend가 이미 올바른 통합 지점이다.
- Linear를 필수 의존성으로 만들지 않는다. ARIS는 tracker adapter interface를 정의하고 실제 프로젝트가 쓰는 tracker부터 시작해야 한다.
- Symphony의 high-trust unattended approval posture를 기본값으로 복사하지 않는다. ARIS에는 이미 permission routing이 있으므로 workflow가 명시적으로 opt-in하기 전까지 operator control을 유지한다.
- 별도 terminal dashboard를 먼저 만들지 않는다. ARIS에는 이미 Project Chat과 realtime event surface가 있으므로 관측성도 그 안에 붙이는 편이 낫다.

## 제안 구현 순서

1. 문서와 type 수준에서 ARIS workflow contract와 `WorkItem` adapter interface를 정의한다.
2. 기존 `ActiveRunRegistry`, `SessionRun`, runtime event data를 기반으로 orchestrator snapshot API를 추가한다.
3. 하나의 eligible work item을 claim하고 격리된 worktree에서 Codex run을 시작하는 작은 dispatcher를 추가한다.
4. 단일 실행 경로가 관측 가능해진 뒤 continuation turn과 retry/backoff를 추가한다.
5. 현재 work item 갱신용 scoped dynamic tool을 추가한다.

이 순서가 첫 구현 범위를 작게 유지한다. ARIS는 넓은 unattended automation으로 바로 뛰어들기 전에 visibility와 orchestration semantics를 먼저 얻는다.
