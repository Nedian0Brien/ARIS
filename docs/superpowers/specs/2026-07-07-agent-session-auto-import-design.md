# Design: Agent Session Auto Import

**Date:** 2026-07-07
**Scope:** Codex/Claude local session import, ARIS chat resume, lazy transcript paging
**Branch:** `docs/agent-session-auto-import-design`
**Worktree:** `/home/ubuntu/project/ARIS/.worktrees/agent-session-auto-import-design`

---

## Goal

ARIS 백엔드가 Codex와 Claude의 기존 로컬 세션을 낮은 부하로 자동 발견하고, 사용자가 ARIS에서 해당 대화를 바로 이어갈 수 있게 한다.

확정 기준:

- 자동 import는 원본 agent 세션으로 resume 가능한 상태를 먼저 보장한다.
- 화면에는 마지막 2~3턴만 선반영한다.
- 이전 transcript는 사용자가 상단에서 `이전 대화 더 불러오기`를 누를 때 추가로 가져온다.
- importer는 기본적으로 낮은 빈도, 작은 파일 수, 작은 byte budget 안에서 동작해야 한다.

---

## Research Findings

### FAR

- **File:** `services/aris-backend/src/index.ts:30-49`
  **Finding:** 백엔드는 이미 PM2 primary instance에서만 10분 주기 cleanup timer를 실행하고 `unref()`한다. 자동 importer도 같은 primary-only timer 패턴을 따라야 한다.

- **File:** `services/aris-backend/prisma/schema.prisma:26-55`
  **Finding:** ARIS의 chat record는 `Chat` mapped model인 `SessionChat`이며 `threadId`, `agent`, `latestPreview`, `lastActivityAt`을 갖는다. Codex/Claude resume id는 새 필드보다 우선 `threadId`에 연결하는 것이 기존 구조에 맞다.

- **File:** `services/aris-backend/prisma/schema.prisma:77-95`
  **Finding:** 화면 transcript는 `SessionChatEvent`에 `chatId`, `sessionId`, `type`, `text`, `meta`, `seq`로 저장된다. import 이벤트도 이 테이블을 사용하되 source dedupe ledger가 필요하다.

- **File:** `services/aris-backend/src/runtime/prismaStore.ts:452-565`
  **Finding:** 현재 `appendChatEvent()`는 이벤트마다 max seq aggregate를 읽고 1건씩 insert한다. importer가 tail 2~3턴만 선반영하는 동안에는 재사용 가능하지만, 과거 paging import에는 batch helper가 필요하다.

- **File:** `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts:43-85`
  **Finding:** Claude project path는 `CLAUDE_CONFIG_DIR || ~/.claude` 아래 `projects/<resolved cwd sanitized>`로 계산된다. 같은 규칙을 자동 discovery에 재사용할 수 있다.

- **File:** `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts:87-135`
  **Finding:** 기존 Claude scanner는 in-memory cursor로 delta를 읽고 internal event type을 건너뛴다. 자동 import는 재시작 후에도 중복이 없어야 하므로 cursor와 source event key를 DB에 저장해야 한다.

- **File:** `services/aris-backend/src/runtime/providers/codex/codexRuntime.ts:1515-1548`
  **Finding:** Codex runtime은 persisted message meta에서 `threadId`를 복구한다. import된 chat의 `threadId`가 원본 Codex session id를 담으면 기존 resume 경로와 맞는다.

- **File:** `services/aris-backend/src/server.ts:245-256`
  **Finding:** `buildServer()`가 `RuntimeStore`를 생성하고 Fastify app에 붙인다. importer는 store 생성 뒤, realtime gateway 설치와 독립적으로 붙이면 된다.

- **File:** `services/aris-backend/src/config.ts:3-12`
  **Finding:** importer 관련 env가 아직 없다. 기능은 opt-in env와 conservative default를 추가해야 한다.

- **File:** `services/aris-web/lib/happy/chats.ts:177-235`
  **Finding:** web helper는 chat 생성 시 `threadId`를 받지 않고 update에서만 받는다. 백엔드 importer는 web helper를 직접 쓰지 말고 backend store helper를 가져야 한다.

- **File:** `services/aris-backend/src/runtime/prismaStore.ts:413-449`
  **Finding:** backend의 chat event 조회는 `seq asc` 기준이다. lazy older import를 나중에 insert하면 DB seq만으로는 과거 메시지가 앞에 놓이지 않는다.

- **File:** `services/aris-web/lib/happy/client.ts:143-185`
  **Finding:** web의 session events pagination은 normalize된 UI event를 `timestamp asc, id asc`로 정렬한 뒤 `before` window를 계산한다. 따라서 imported event의 source timestamp를 `createdAt`으로 보존하면 기존 web pagination과 맞출 수 있다.

- **File:** `services/aris-web/components/project-chat/ProjectChatSurface.tsx:1869-1923`
  **Finding:** project chat UI는 이미 `before=<oldestEventId>` 기반 `loadOlderEvents()`와 scroll height 보정을 갖고 있다. 새 버튼/스크롤 구조를 만들기보다 기존 loadOlder 경로가 imported older fetch를 트리거하게 연결하는 편이 작고 안전하다.

- **Observed local source:** `/home/ubuntu/.codex/sessions/2026/07/06/rollout-2026-07-06T22-38-12-019f37a6-973e-73d3-b589-decabb86853e.jsonl`
  **Finding:** Codex session file은 첫 줄에 `type: "session_meta"`와 `payload.id`, `payload.cwd`를 포함한다. importer는 메타 라인에서 project match와 provider session id를 먼저 확정하고, system/developer instruction payload는 transcript로 가져오면 안 된다.

---

## Chosen Approach

`metadata-first discovery + tail prefetch + lazy older import` 구조로 간다.

1. **Discovery:** 백엔드가 낮은 빈도로 Codex/Claude session 파일의 metadata만 읽어 ARIS 프로젝트 경로와 맞는 세션을 찾는다.
2. **Resume bridge:** 발견한 provider session id를 `Chat.threadId`에 저장해 ARIS의 기존 resume path를 사용한다.
3. **Tail prefetch:** chat 생성 직후 마지막 2~3턴만 `SessionChatEvent`로 import한다.
4. **Lazy older paging:** 사용자가 요청할 때만 더 오래된 transcript를 source file에서 역방향으로 읽어 앞쪽에 추가한다.
5. **Ledger:** import 상태, cursor, source event dedupe key를 DB에 저장해 backend 재시작, PM2 cluster, repeated scan에서도 중복을 막는다.

---

## Data Model

### `ImportedAgentSession`

```prisma
model ImportedAgentSession {
  id                 String   @id @default(cuid())
  provider           String
  providerSessionId  String
  sourcePath         String
  projectPath        String
  arisSessionId      String?
  chatId             String?
  tailCursorOffset   BigInt?
  oldestCursorOffset BigInt?
  newestCursorOffset BigInt?
  fileSize           BigInt   @default(0)
  fileMtimeMs        BigInt   @default(0)
  importedTurnCount  Int      @default(0)
  importedEventCount Int      @default(0)
  hasMoreBefore      Boolean  @default(true)
  status             String   @default("discovered")
  errorMessage       String?
  lastScannedAt      DateTime?
  lastImportedAt     DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([provider, sourcePath])
  @@index([provider, providerSessionId])
  @@index([status, lastScannedAt])
  @@index([chatId])
}
```

### `ImportedAgentEvent`

```prisma
model ImportedAgentEvent {
  id             String   @id @default(cuid())
  importId       String
  sourceEventKey String
  chatEventId    String?
  sourceOffset   BigInt?
  createdAt      DateTime @default(now())

  @@unique([importId, sourceEventKey])
  @@index([chatEventId])
}
```

`SessionChatEvent.meta`에도 다음 값을 넣는다.

```ts
{
  imported: true,
  importedProvider: 'codex' | 'claude',
  importedSessionId: string,
  sourceEventKey: string,
  sourceOffset?: string,
  sourceCreatedAt?: string,
  role?: 'user' | 'assistant',
}
```

---

## Backend Importer

### Config

초기 rollout은 opt-in으로 둔다.

```ts
ARIS_SESSION_AUTO_IMPORT=0
ARIS_SESSION_IMPORT_INTERVAL_MS=600000
ARIS_SESSION_IMPORT_LOOKBACK_DAYS=7
ARIS_SESSION_IMPORT_MAX_FILES=20
ARIS_SESSION_IMPORT_MAX_BYTES=2097152
ARIS_SESSION_IMPORT_MAX_EVENTS=200
ARIS_SESSION_IMPORT_TAIL_TURNS=3
ARIS_SESSION_IMPORT_CONCURRENCY=1
ARIS_SESSION_IMPORT_USER_ID=
```

`ARIS_SESSION_IMPORT_USER_ID`가 비어 있으면 importer는 discovery만 기록하고 chat 생성은 하지 않는다. multi-user ownership이 명확하지 않은 환경에서 임의 user에게 chat을 노출하지 않기 위해서다.

### Scheduling

- `services/aris-backend/src/index.ts`의 cleanup timer와 같은 primary-only 조건을 사용한다.
- interval run은 overlap guard를 둔다.
- 한 tick에서 provider별 file count, byte budget, event budget을 넘으면 즉시 중단한다.
- scan failure는 importer 전체를 죽이지 않고 ledger status/error에 기록한다.

### Discovery Rules

Codex:

- base dir: `CODEX_HOME || ~/.codex`
- source glob: `sessions/YYYY/MM/DD/rollout-*.jsonl`
- candidate filter: file mtime within lookback, size under max bytes
- metadata: first parseable `session_meta` line의 `payload.id`, `payload.cwd`
- project match: `payload.cwd`가 ARIS project/session path와 같거나 configured project roots 아래에 있어야 한다.

Claude:

- base dir: `CLAUDE_CONFIG_DIR || ~/.claude`
- project dir rule: existing `buildProjectPath(workingDirectory)`와 동일
- source glob: `projects/<projectId>/*.jsonl`
- metadata: file name UUID를 provider session id로 사용하고, payload 내부 session id가 있으면 교차 검증한다.

### Tail Import

- parser는 source file을 끝에서부터 읽어 user/assistant message만 수집한다.
- system/developer instruction, tool raw payload, lifecycle/internal event는 transcript에 넣지 않는다.
- 2~3턴은 "마지막 user message와 그 뒤 assistant response"를 1턴으로 센다.
- import된 event는 `type: "message"` 또는 기존 chat 화면이 이미 처리하는 message-compatible type을 사용한다.
- event `createdAt`은 source timestamp가 있으면 반드시 사용하고, 없으면 file mtime 기반 순서를 유지한다. web pagination이 timestamp 기준으로 정렬되므로 lazy older import의 화면 순서를 위해 이 값이 중요하다.
- tail import가 끝난 뒤 `SessionChat.latestPreview`, `latestEventAt`, `lastActivityAt`을 실제 마지막 imported event 기준으로 갱신한다.

### Lazy Older Import

backend 내부 API:

```http
POST /v1/chats/:chatId/import/older
Authorization: Bearer <RUNTIME_API_TOKEN>

{
  "limitTurns": 3
}
```

응답:

```json
{
  "events": [],
  "hasMoreBefore": true,
  "oldestCursorOffset": "12345"
}
```

동작:

- `ImportedAgentSession.chatId`로 source file과 cursor를 찾는다.
- `oldestCursorOffset` 이전 범위에서 older turns만 읽는다.
- dedupe table에 이미 있는 `sourceEventKey`는 건너뛴다.
- 새 이벤트는 DB에는 현재 max seq 뒤에 저장한다. 화면 순서는 `createdAt`에 보존한 source timestamp와 기존 web pagination 정렬에 맡긴다.
- Next API route인 `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`는 imported chat에서 `before` 요청을 받을 때, 먼저 backend older import API를 호출한 뒤 기존 `getSessionEvents()`를 다시 계산한다.
- 초기 tail만 있는 상태에서도 상단 버튼이 보여야 하므로, events route는 import ledger의 `hasMoreBefore`를 page metadata에 반영해야 한다.

---

## Web UX

채팅 목록:

- import된 chat은 일반 chat처럼 보인다.
- title은 provider session에서 유추하되, 실패하면 `Codex 가져온 대화`, `Claude 가져온 대화`처럼 짧게 둔다.
- 내부 상태명인 imported, cursor, fallback은 화면에 노출하지 않는다.

채팅 화면:

- 가장 위쪽에 이전 transcript가 남아 있으면 `이전 대화 더 불러오기` 버튼을 보여준다.
- 버튼 클릭 중 loading state를 보여주고 중복 클릭을 막는다.
- 실패 시 `이전 대화를 불러오지 못했어요`처럼 사용자 행동 기준의 짧은 문구를 보여준다.

전송:

- 사용자가 import chat에서 메시지를 보내면 기존 agent runtime이 `Chat.threadId`를 읽어 원본 Codex/Claude session으로 resume한다.
- resume 실패는 새 thread로 조용히 넘어가지 않는다. 실패 사실을 runtime error로 드러내고 복구 행동을 제시한다.

---

## Risks and Guards

- **Source format drift:** Codex/Claude jsonl schema는 외부 도구 버전에 따라 바뀔 수 있다. parser는 fixture 기반 테스트와 tolerant field extraction을 갖되, 모르는 record를 transcript로 표시하지 않는다.
- **Privacy leakage:** base instructions, system prompt, tool raw output은 import하지 않는다. user/assistant conversational text만 transcript 후보가 된다.
- **Duplicate chat:** unique `(provider, sourcePath)`와 dedupe event table로 막는다.
- **High IO:** primary-only timer, lookback, max files, max bytes, concurrency 1, overlap guard를 모두 적용한다.
- **Wrong ownership:** `ARIS_SESSION_IMPORT_USER_ID` 없이는 chat을 자동 생성하지 않는다.
- **Ordering mismatch:** older import는 source timestamp와 cursor를 함께 저장한다. web ordering이 부족하면 implementation plan에서 display order 보강을 별도 task로 처리한다.

---

## Out of Scope

- 원본 Codex/Claude tool call 전체 재현
- 모든 과거 transcript 선제 import
- 여러 사용자에게 같은 local session을 자동 분배
- production 자동 활성화
- Gemini session import

---

## Implementation Readiness

이 설계는 바로 구현에 들어갈 수 있다. 다만 첫 구현 task는 parser fixture 확보와 현재 web event ordering 검증이어야 한다. source schema가 외부 도구 버전에 묶여 있으므로, fixture를 먼저 고정한 뒤 importer/store/API/UI를 붙이는 순서가 가장 안전하다.
