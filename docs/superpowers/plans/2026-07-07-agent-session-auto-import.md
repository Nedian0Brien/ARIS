# Agent Session Auto Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex/Claude 로컬 세션을 ARIS chat으로 가져오되, 즉시 resume 가능한 chat을 만들고 마지막 2~3턴만 먼저 보여준 뒤 과거 transcript는 사용자가 요청할 때 lazy import한다.

**Architecture:** 백엔드 primary-only importer가 provider jsonl 파일을 낮은 빈도로 발견하고 durable import ledger를 기록한다. `SessionChat.threadId`에는 원본 provider session id를 저장한다. 최근 tail은 `SessionChatEvent`에 저장하고, web events route는 imported chat의 `before` 요청에서 older import를 먼저 수행한 뒤 기존 pagination을 재계산한다.

**Tech Stack:** Node.js, Fastify, Prisma, PostgreSQL, TypeScript, React/Next.js, vitest

---

## 기준 문서

- Spec: `docs/superpowers/specs/2026-07-07-agent-session-auto-import-design.md`
- Backend timer 기준: `services/aris-backend/src/index.ts`
- Chat/event schema 기준: `services/aris-backend/prisma/schema.prisma`
- Event persistence 기준: `services/aris-backend/src/runtime/prismaStore.ts`
- Claude scanner 기준: `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts`
- Codex resume 기준: `services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
- Project chat UI 기준: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- Web events route 기준: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`

## 구현 Worktree

구현은 main checkout이 아니라 전용 worktree에서 시작한다.

```bash
cd /home/ubuntu/project/ARIS
scripts/create_worktree_with_shared_node_modules.sh .worktrees/agent-session-auto-import codex/agent-session-auto-import main
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
```

---

## Task 1: Baseline과 Fixture 확보

**Files:**

- Create: `services/aris-backend/tests/fixtures/import/codex-session-tail.jsonl`
- Create: `services/aris-backend/tests/fixtures/import/claude-session-tail.jsonl`
- Modify: `services/aris-backend/tests/**` only as needed

- [ ] **Step 1: backend baseline 확인**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npm run typecheck
npm test
```

- [ ] **Step 2: sanitized fixture 작성**

작은 fixture에 다음 케이스를 포함한다.

- Codex `session_meta`의 `payload.id`, `payload.cwd`
- 현재 관찰된 Codex user/assistant tail record shape
- 현재 `~/.claude/projects/.../*.jsonl`에서 확인한 Claude user/assistant record shape
- transcript로 가져오면 안 되는 internal/system/tool record

- [ ] **Step 3: fixture 기반 parser 실패 테스트 추가**

아직 parser가 없으므로 metadata extraction, ignored record, tail turn limit 테스트가 실패해야 한다.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/tests
git commit -m "test: add agent session import fixtures"
```

---

## Task 2: Import Ledger Schema 추가

**Files:**

- Modify: `services/aris-backend/prisma/schema.prisma`
- Add: `services/aris-backend/prisma/migrations/<timestamp>_agent_session_import/migration.sql`

- [ ] **Step 1: ledger model 추가**

Spec의 `ImportedAgentSession`, `ImportedAgentEvent`를 추가한다. `sourceOffset`처럼 JSON meta에 들어가는 값은 문자열로 노출하고, DB cursor는 `BigInt`로 유지한다.

- [ ] **Step 2: migration 생성**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npx prisma migrate dev --name agent_session_import --create-only
npx prisma generate
```

- [ ] **Step 3: schema 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/prisma
git commit -m "feat: add imported agent session ledger schema"
```

---

## Task 3: Provider Import Parser 구현

**Files:**

- Add: `services/aris-backend/src/runtime/import/providerSessionTypes.ts`
- Add: `services/aris-backend/src/runtime/import/codexSessionImportParser.ts`
- Add: `services/aris-backend/src/runtime/import/claudeSessionImportParser.ts`
- Add/Modify: `services/aris-backend/tests/agentSessionImportParsers.test.ts`

- [ ] **Step 1: parser 테스트를 먼저 완성**

검증 항목:

- Codex `session_meta`에서 provider session id와 cwd 추출
- Codex cwd project match
- Claude file/session id 추출
- user/assistant text만 추출
- internal/system/tool record 무시
- tail turn limit 3 적용
- stable `sourceEventKey`
- `oldestCursorOffset`, `newestCursorOffset`, `sourceCreatedAt` 산출

- [ ] **Step 2: provider-neutral type 정의**

```ts
type ImportedProviderMessage = {
  role: 'user' | 'assistant';
  text: string;
  sourceEventKey: string;
  sourceOffset?: bigint;
  sourceCreatedAt?: Date;
};
```

- [ ] **Step 3: Codex parser 구현**

jsonl을 line-by-line으로 읽는다. `session_meta.payload.id`, `session_meta.payload.cwd`만 metadata로 사용하고 base instructions, system/developer content, raw tool output은 emit하지 않는다.

- [ ] **Step 4: Claude parser 구현**

`claudeSessionScanner.ts`의 field extraction 방식을 참고하되, importer parser는 pure function으로 두고 DB cursor에 의존하지 않는다.

- [ ] **Step 5: 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npx vitest run tests/agentSessionImportParsers.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/src/runtime/import services/aris-backend/tests
git commit -m "feat: parse codex and claude sessions for import"
```

---

## Task 4: Store Helper와 Ordering 계약 추가

**Files:**

- Modify: `services/aris-backend/src/runtime/prismaStore.ts`
- Add/Modify: `services/aris-backend/tests/agentSessionImportStore.test.ts`

- [ ] **Step 1: durable dedupe 테스트 추가**

검증 항목:

- provider/source path 기준 ledger row 1회 생성
- `threadId`가 있는 chat 생성
- tail event 중복 import 방지
- source timestamp를 `SessionChatEvent.createdAt`과 meta `sourceCreatedAt`에 보존
- latest preview/activity를 가장 최신 source event 기준으로 갱신
- 반복 import가 기존 chat을 반환

- [ ] **Step 2: store method 추가**

`prismaStore.ts`의 기존 chat helper 근처에 추가한다.

```ts
discoverImportedAgentSession(input): Promise<ImportedAgentSessionRecord>
ensureImportedAgentChat(input): Promise<{ chatId: string }>
appendImportedAgentEvents(input): Promise<RuntimeMessage[]>
loadOlderImportedAgentEvents(input): Promise<{ events: RuntimeMessage[]; hasMoreBefore: boolean }>
getImportedAgentSessionState(chatId): Promise<{ hasMoreBefore: boolean } | null>
```

- [ ] **Step 3: seq와 display ordering 검증**

현재 backend `listChatEvents()`는 `seq asc`로 읽지만 web pagination은 timestamp를 다시 정렬한다. imported older event는 DB seq로는 뒤에 붙어도 `createdAt`이 source timestamp면 web에서 앞쪽으로 정렬되어야 한다. 이 동작을 store/web client 단위 테스트 중 하나로 고정한다.

- [ ] **Step 4: 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npx vitest run tests/agentSessionImportStore.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/src/runtime/prismaStore.ts services/aris-backend/tests
git commit -m "feat: persist imported agent sessions"
```

---

## Task 5: Primary-Only Import Worker 추가

**Files:**

- Modify: `services/aris-backend/src/config.ts`
- Add: `services/aris-backend/src/runtime/import/agentSessionImportWorker.ts`
- Add: `services/aris-backend/src/runtime/import/sessionDiscovery.ts`
- Modify: `services/aris-backend/src/index.ts`
- Add: `services/aris-backend/tests/agentSessionImportWorker.test.ts`

- [ ] **Step 1: conservative env 추가**

Spec의 env를 추가한다. `ARIS_SESSION_AUTO_IMPORT` default는 반드시 off다.

- [ ] **Step 2: scheduler 테스트 추가**

검증 항목:

- default disabled
- enabled일 때만 실행
- PM2 primary instance에서만 실행
- overlap guard
- max files, max bytes budget 적용
- `ARIS_SESSION_IMPORT_USER_ID`가 없으면 discovery만 기록하고 chat은 생성하지 않음

- [ ] **Step 3: discovery 구현**

Codex는 `~/.codex/sessions`를 lookback/mtime 기준으로 스캔한다. Claude는 기존 project path rule을 재사용한다.

- [ ] **Step 4: timer 연결**

`src/index.ts`에서 cleanup timer와 같은 lifecycle로 importer timer를 시작하고 shutdown에서 정리한다.

- [ ] **Step 5: 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npx vitest run tests/agentSessionImportWorker.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/src services/aris-backend/tests
git commit -m "feat: add automatic agent session import worker"
```

---

## Task 6: Backend Older Import API 추가

**Files:**

- Modify: `services/aris-backend/src/server.ts`
- Add/Modify: `services/aris-backend/tests/runtimeApi*.test.ts`

- [ ] **Step 1: API 테스트 추가**

검증 항목:

- runtime bearer token 필요
- import ledger가 없는 chat은 404
- older event와 `hasMoreBefore` 반환
- 반복 요청 중복 없음
- `limitTurns` 최대값 강제

- [ ] **Step 2: route 구현**

추가:

```http
POST /v1/chats/:chatId/import/older
GET /v1/chats/:chatId/import-state
```

두 route 모두 Task 4의 store helper를 사용한다.

- [ ] **Step 3: 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npx vitest run tests/runtimeApi*.test.ts
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-backend/src/server.ts services/aris-backend/tests
git commit -m "feat: expose imported transcript paging api"
```

---

## Task 7: Web Events Route와 Project Chat 연결

**Files:**

- Modify: `services/aris-web/lib/happy/client.ts`
- Modify: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`
- Modify: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- Add/Modify: `services/aris-web/tests/**`

- [ ] **Step 1: 기존 loadOlder 경로 테스트 추가**

`before` 요청이 imported chat이면 route가 먼저 backend older import API를 호출한 뒤 `getSessionEvents()`를 재계산하는지 검증한다.

- [ ] **Step 2: Happy client 함수 추가**

backend의 `GET /v1/chats/:chatId/import-state`, `POST /v1/chats/:chatId/import/older`를 호출하는 작은 helper를 추가한다.

- [ ] **Step 3: events route 연결**

동작:

- initial page에서 import state가 `hasMoreBefore=true`면 `page.hasMoreBefore`를 true로 보정한다.
- `before` 요청이고 import state가 `hasMoreBefore=true`면 older import API를 먼저 호출한다.
- 그 다음 기존 `getSessionEvents()` 결과를 반환한다.

- [ ] **Step 4: UI copy와 state 점검**

Project chat의 기존 상단 loading/loadOlder 흐름을 재사용한다. 필요한 경우 버튼 문구만 `이전 대화 더 불러오기`로 맞춘다. 화면에는 `imported`, `cursor`, `fallback`, `runtime`, source path 같은 내부 용어를 노출하지 않는다.

- [ ] **Step 5: 검증**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-web
npm run typecheck
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git add services/aris-web
git commit -m "feat: load imported transcript on demand"
```

---

## Task 8: End-to-End 검증과 Handoff

**Files:**

- Add/Modify: `docs/03-platform/agent-session-auto-import.md` if operator note is useful
- Modify: `deploy/README.md` only if rollout env documentation is required

- [ ] **Step 1: targeted checks 실행**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-backend
npm run typecheck
npm test
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import/services/aris-web
npm run typecheck
npx vitest run
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git diff --check
```

- [ ] **Step 2: dev proxy 열기**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 WEB_DEV_AUTO_PORT=1 ./deploy/dev/run_web_dev_hot_reload.sh
```

최종 보고에는 정확한 `https://lawdigest.cloud/proxy/<port>/` URL을 포함한다.

- [ ] **Step 3: manual smoke**

검증 항목:

- configured user에게만 imported Codex/Claude chat이 보임
- chat을 열면 마지막 2~3턴만 보임
- `이전 대화 더 불러오기`가 older transcript를 앞에 붙임
- 새 메시지 전송 시 `threadId`로 원본 provider session에 resume됨
- importer log가 budget/skip reason을 기록하되 반복 noise를 만들지 않음

- [ ] **Step 4: 최종 push**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import
git status --short
git push -u origin codex/agent-session-auto-import
```

---

## Rollout Notes

- production에서는 backend/web smoke와 supervised dev import가 통과할 때까지 `ARIS_SESSION_AUTO_IMPORT=0`을 유지한다.
- production 활성화 첫 값은 아래처럼 작게 시작한다.

```env
ARIS_SESSION_AUTO_IMPORT=1
ARIS_SESSION_IMPORT_INTERVAL_MS=600000
ARIS_SESSION_IMPORT_LOOKBACK_DAYS=3
ARIS_SESSION_IMPORT_MAX_FILES=10
ARIS_SESSION_IMPORT_MAX_BYTES=1048576
ARIS_SESSION_IMPORT_TAIL_TURNS=3
ARIS_SESSION_IMPORT_CONCURRENCY=1
```

- main merge만으로 production 배포하지 않는다. 사용자가 명시적으로 배포를 지시하면 `deploy/README.md` 기준으로 진행한다.
