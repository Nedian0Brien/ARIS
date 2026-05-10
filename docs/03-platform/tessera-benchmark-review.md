# Tessera Benchmark Review

**Date**: 2026-05-10
**Tessera source**: <https://github.com/horang-labs/tessera> (`main` at `5f9bbc8a4bcaa7f9c19aa5898cebb00ea2cfc556`)
**ARIS source**: `origin/main` at `a55aeaa`

## 검토 요약

Tessera는 ARIS와 제품 축이 많이 겹친다. 둘 다 여러 coding agent CLI를 하나의 작업 공간에서 실행하고, provider별 이벤트를 공통 타임라인과 Git/worktree 흐름으로 정규화하려 한다.

다만 ARIS가 이미 가진 기반도 작지 않다. ARIS는 `SessionChat`/`SessionRun`/`SessionChatEvent` 기반의 채팅 실행 모델, provider별 runtime tree, 권한 라우터, SSE 이벤트 스트림, image/context composer, workspace git/files/terminal 패널을 갖고 있다. 따라서 Tessera를 화면 단위로 이식하기보다 아래 빈 구멍을 선택적으로 가져오는 편이 낫다.

## 이미 ARIS에 반영된 Tessera 계열 아이디어

- `CliProvider`/`CliProviderRegistry` 골격은 이미 들어와 있다. ARIS의 `services/aris-backend/src/runtime/contracts/cliProvider.ts`와 `providerRegistry.ts`는 Tessera adapter 패턴을 직접 차용했다고 명시한다.
- Codex 전용 provider 디렉터리도 현재 존재한다. 과거 문서에는 `runtime/providers/codex/`가 없다고 되어 있지만, 현재 코드는 `services/aris-backend/src/runtime/providers/codex/` 아래에 adapter, launcher, protocol mapper, app-server client/lifecycle, permission bridge 등을 둔다.
- 채팅 timeline과 권한 이벤트는 ARIS 쪽이 이미 깊다. `SessionChatEvent`와 `Permission` 모델, `events/stream` SSE, `PermissionRouter`가 있어 Tessera의 observable timeline을 완전히 새로 만들 필요는 없다.
- Git 패널도 부분적으로 존재한다. ARIS는 workspace pane에서 branch/ahead/behind, working/staged file list, diff, stage/unstage, commit/fetch/pull/push까지 제공한다.
- Composer도 기본 맥락 기능은 있다. ARIS는 provider/model/reasoning effort, composer mode, image upload, file/text context block을 이미 전달한다.

## 적용 후보

### 1. Provider adapter wiring 마무리

**추천도: 매우 높음**

Tessera는 `server.ts`에서 provider bootstrap을 직접 import하고, startup 때 CLI status prewarm을 수행한다. ARIS는 registry와 CodexAdapter 구조는 있지만 CodexAdapter의 `spawn`, `sendMessage`, `parseStdout`, `updateSessionConfig`가 아직 `NotYetWiredError`를 던지고, codex bootstrap도 production entry에서 import되지 않는다. `providerCommandFactory.ts` 역시 claude/gemini만 반환한다.

ARIS에 필요한 일은 새 추상화를 또 만드는 것이 아니라, 현재 structural slot을 실제 runtime path로 연결하는 것이다.

적용 범위:
- `services/aris-backend/src/runtime/providers/codex/codexAdapter.ts`의 lifecycle methods 실제 연결
- `services/aris-backend/src/runtime/providers/providerCommandFactory.ts`에 codex 분기 복구
- provider bootstrap import 위치 확정
- startup CLI status snapshot/prewarm API 추가

효과:
- provider 실행 경계가 문서와 코드에서 일치한다.
- Codex/Claude/Gemini 사이 기능 차이를 UI에서 설명하기 쉬워진다.
- 이후 OpenCode 같은 provider를 추가할 때 runtimeCore를 다시 뚫지 않아도 된다.

### 2. Managed worktree creation을 사용자 플로우로 승격

**추천도: 높음**

Tessera는 task 생성 시 managed worktree를 먼저 만들고, branch/path collision, git 설치 여부, non-git repo 등을 명확한 에러로 처리한다. ARIS에는 `worktreeManager.ts`와 repo-level worktree script가 있지만, runtime session creation은 `branch` 문자열을 받아 `.worktrees/<branch>`를 보장하는 단순 모델에 가깝다.

ARIS에는 AGENTS.md의 전용 worktree 원칙이 이미 강하다. 이 규칙을 UI/runtime 기능으로 끌어올리면 사용자와 agent 모두 같은 규칙을 따르게 된다.

적용 범위:
- `runtime/managedWorktree/allocator.ts`, `preflight.ts`, `retention.ts` 계층 추가
- 기존 `scripts/create_worktree_with_shared_node_modules.sh`를 allocator 내부 hook으로 사용
- 프로젝트 채팅에서 "새 작업으로 실행" 시 branch slug와 worktree path 자동 생성
- PM2 cluster에서는 cleanup/retention leader guard 적용

효과:
- "작업을 시작하기 전에 전용 worktree 생성"이 문서 규칙이 아니라 제품 기능이 된다.
- branch collision, already checked out, node_modules link 누락 같은 반복 장애가 줄어든다.

### 3. Git panel에 PR 상태와 PR 액션 추가

**추천도: 높음**

Tessera의 Git 패널은 diff와 commit을 넘어서 push, PR 생성, PR merge, checks URL, branch/PR sync 상태까지 task와 연결한다. ARIS의 Git 패널은 현재 stage/unstage, commit, fetch/pull/push, diff가 중심이고 PR 상태는 보이지 않는다.

ARIS는 사용자가 "커밋, 푸쉬, PR, 머지, 배포"를 한 흐름으로 자주 요청한다. Git panel에 PR 상태만 들어와도 작업 종료 판단이 훨씬 선명해진다.

적용 범위:
- `services/aris-web/app/api/runtime/sessions/[sessionId]/git/route.ts`에 PR read/create/merge action 확장
- workspace git pane에 PR badge, checks link, create PR, merge PR action 추가
- backend는 `gh` 사용 가능 여부와 GitHub remote 여부를 명확히 분리

효과:
- 채팅 로그 밖에서도 작업 branch가 어디까지 갔는지 볼 수 있다.
- "푸시됐는지", "PR이 열렸는지", "mergeable인지"를 agent 응답에만 의존하지 않아도 된다.

### 4. Work Queue view: Kanban 전체 이식보다 가벼운 작업 보드

**추천도: 중간-높음**

Tessera는 `tasks`, `collections`, `workflow_status`, PR status를 schema 레벨로 두고 Kanban/list view를 제공한다. ARIS는 현재 project/session/chat 중심 모델이라 task/workflow entity가 없다.

ARIS에 곧바로 full Kanban을 넣으면 IA가 커진다. 대신 `SessionChat` 또는 새 `Task` entity에 최소 상태만 붙여 "todo / running / review / done" 정도의 Work Queue view를 먼저 만드는 쪽이 맞다.

적용 범위:
- `SessionChat`에 workflow status를 붙일지, 별도 `Task` 모델을 둘지 먼저 결정
- project chat sidebar 또는 workspace home에 Work Queue view 추가
- worktree branch, PR status, run status를 같은 row에 표시

효과:
- 여러 agent run을 병렬로 맡긴 뒤 상태를 한 화면에서 스캔할 수 있다.
- ARIS의 chat-first 흐름은 유지하면서 implementation task 추적만 보강한다.

### 5. Skills dashboard / skill picker

**추천도: 중간**

Tessera는 로컬 Claude skills를 발견하고, 검색/즐겨찾기/분석을 제공한다. ARIS의 composer는 command menu, image/file/text context는 있지만 provider skill discovery UI는 없다.

ARIS 사용 환경은 Codex/Claude/Gemini별 skill과 project memory가 많다. 이 기능은 "에이전트에게 어떤 능력을 붙여 보낼지"를 UI로 드러내는 데 가치가 있다. 단, provider마다 skill format이 달라서 Tessera의 Claude-only dashboard를 그대로 복사하면 안 된다.

적용 범위:
- provider별 skill source를 읽는 read-only API
- composer의 context chip 옆에 skill chip 추가
- 즐겨찾기/최근 사용 skill 우선 노출

효과:
- 사용자가 기억하지 못하는 local skills를 제품이 발견해 준다.
- 복잡한 프롬프트보다 명시적 capability 선택으로 agent run을 안정화할 수 있다.

### 6. Workspace panel model 확장

**추천도: 중간**

Tessera는 multi-panel, tabbed workspace, diff/file tabs를 강하게 밀고 간다. ARIS도 workspace pager와 files/git/terminal/context/preview 표면을 갖고 있지만, 현재 `buildWorkspacePagerItems()`는 chat과 workspace만 반환하고 동적 panel item은 사용하지 않는다.

ARIS에는 이미 "작업 화면 안의 보조 패널"이라는 제품 방향이 있으므로, Tessera식 split workspace를 완전히 복제하기보다 기존 pager를 실제 persisted panel layout과 연결하는 편이 낫다.

적용 범위:
- panel layout의 `panels`를 pager item으로 실제 반영
- file/diff/preview open action을 session-scoped workspace tab으로 열기
- 모바일에서는 swipe pager를 유지하고 desktop에서는 split/pinned panels 허용

효과:
- 에이전트 출력, 변경 diff, 파일, preview를 같은 session 맥락에서 잃지 않는다.

### 7. WebSocket event channel과 mutation broadcast

**추천도: 중간**

Tessera는 session create/resume/message/send/interactive response, provider list, mutation broadcast를 WebSocket 중심으로 묶는다. ARIS는 chat event는 SSE + DB polling + realtime cursor 조합이고, WebSocket은 terminal/local preview 쪽에 더 가깝다.

이건 바로 갈아엎기보다, "mutation broadcast"만 먼저 가져오는 것이 안전하다. 예를 들어 chat/session/task/git 상태 변경을 같은 tab들에 즉시 알리는 얇은 channel부터 시작할 수 있다.

적용 범위:
- session/chat/git mutation broadcast endpoint
- 현재 SSE event stream은 유지
- polling 간격을 줄이기보다 mutation hint로 refresh 타이밍을 맞춤

효과:
- running 상태, unread 상태, git 상태가 늦게 보이는 문제가 줄어든다.

## 지금 복사하지 않는 편이 나은 것

- Electron desktop packaging: ARIS는 서버 운영/도메인/proxy 기반 사용성이 더 중요하다.
- Tessera의 local `sql.js` storage: ARIS는 이미 PostgreSQL/Prisma 기반이다.
- PostHog telemetry: ARIS의 현재 운영/보안 성격과 우선순위가 다르다.
- Full Kanban-first IA: ARIS의 주 화면은 chat/workspace이며, 보드는 보조 view부터 시작해야 한다.
- OpenCode provider: 흥미롭지만, 현재 ARIS는 Codex/Claude/Gemini 안정화가 먼저다.

## 우선순위 제안

1. **Provider adapter wiring 마무리**: 이미 절반 들어와 있고, 런타임 구조 정합성 가치가 가장 크다.
2. **Managed worktree 사용자 플로우화**: ARIS 운영 규칙과 제품 UX가 바로 연결된다.
3. **Git panel PR 상태/액션 추가**: 작업 종료와 검토 흐름이 눈에 보인다.
4. **Work Queue view 최소형**: full Kanban보다 작은 상태 보드부터 검증한다.
5. **Skills dashboard/picker**: agent capability 선택 UX를 보강한다.
6. **Workspace panel model 확장**: 기존 pager와 persisted panels를 잇는다.
7. **WebSocket mutation broadcast**: SSE 교체가 아니라 보조 신호로 도입한다.

## 즉시 생성할 후속 이슈 후보

- provider architecture plan이 현재 코드와 어긋난 부분 정리
- CodexAdapter lifecycle wiring
- managed worktree allocator + preflight 도입
- workspace git pane PR status/action 확장
- Work Queue 최소 모델 설계
