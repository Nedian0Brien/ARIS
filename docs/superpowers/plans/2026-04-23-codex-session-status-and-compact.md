# Codex Session Status And Compact Control Plan

> **For agentic workers:** 구현 시에는 먼저 현재 Codex 런타임이 `app-server` 경로인지 확인하고, `tmux` 셸 attach 경로와 혼동하지 않는다. 단계는 checkbox (`- [ ]`) 기준으로 진행한다.

**Goal:** ARIS에서 활성 Codex 채팅의 현재 세션 상태를 안정적으로 조회하고, 사용자가 수동으로 context compact를 안전하게 실행할 수 있게 만든다.

**Architecture:** 현재 ARIS의 Codex 런타임은 `services/aris-backend/src/runtime/happyClient.ts` 에서 기본적으로 `CODEX_RUNTIME_MODE=app-server` 를 사용하며, 실제 turn 실행은 `thread/start`/`thread/resume` 후 `turn/start` 로 제어된다. 따라서 `/status` 와 `/compact` 의 구현 기준은 `tmux` 터미널이 아니라 `sessionId + chatId + threadId` 로 식별되는 활성 Codex thread 여야 한다. `/status` 는 app-server에서 읽을 수 있는 thread 상태와 account rate limit snapshot을 조합한 ARIS 전용 상태 화면으로 정의하고, `/compact` 는 app-server의 `thread/compact/start` 를 직접 호출하는 제어 액션으로 설계한다.

**Tech Stack:** Fastify, Next.js App Router, React, existing Happy runtime bridge, Codex app-server protocol, Vitest

---

### Design decisions

- `services/aris-web/app/sessions/[sessionId]/chatCommands.ts` 의 현재 Codex `status`/`usage` 구현은 새 `codex --no-alt-screen` 프로세스를 띄운 뒤 `/status` 를 자동 입력하는 probe다. 이 방식은 활성 채팅 thread의 실제 context 상태와 직접 연결되지 않는다.
- `services/aris-web/app/sessions/[sessionId]/UsageProbeModal.tsx` 는 `/ws/terminal` 로 generic shell에 붙는다. 반면 실제 Codex turn은 `services/aris-backend/src/runtime/happyClient.ts` 의 app-server websocket에서 제어된다.
- Codex app-server schema 기준으로 안정적으로 쓸 수 있는 메서드는 `thread/read`, `account/rateLimits/read`, `thread/compact/start` 다.
- app-server schema에서는 CLI `/status` 가 보여주는 `current token usage`, `remaining context capacity` 와 동일한 machine-readable 필드를 아직 확인하지 못했다. 따라서 v1 상태 화면은 "CLI `/status` 복제"가 아니라 "ARIS Codex Session Status" 로 정의해야 한다.
- `thread/compact/start` 는 공식 request/response 메서드가 있으며, `turn/start` 계열 에러 스키마에는 manual compact 중 `activeTurnNotSteerable` / `turnKind=compact` 사례가 명시돼 있다. 따라서 compact 실행 전 preflight와 중복 실행 lock이 필요하다.

### Proposed status payload

ARIS v1 `Codex Session Status` 응답은 다음 필드를 포함한다.

- `sessionId`
- `chatId`
- `threadId`
- `agentFlavor`
- `runtimeChannel`
  - 예상값: `app_server`
- `model`
- `threadStatus`
  - `notLoaded` | `idle` | `active` | `systemError`
- `threadActiveFlags`
  - `waitingOnApproval`, `waitingOnUserInput`
- `lastCompaction`
  - `thread/read(includeTurns=true)` 결과에서 마지막 `contextCompaction` item 기준
- `rateLimits`
  - `account/rateLimits/read` 의 `primary` / `secondary`
- `statusCollectedAt`
- `rawSource`
  - `codex_app_server`

주의:

- 이 payload는 "현재 thread가 어떤 상태인지" 와 "계정 usage window가 어느 정도 찼는지" 를 보여준다.
- CLI `/status` 의 exact token/capacity 숫자를 보장하지 않는다.
- CLI parity가 꼭 필요하면 별도 spike로 `codex exec resume <threadId> "/status"` 실험 경로를 추가 검토한다.

### Proposed compact safety rules

- active agent flavor가 `codex` 가 아니면 compact 버튼을 숨기거나 비활성화한다.
- `chatId` 가 없거나 해당 chat의 `threadId` 를 해석할 수 없으면 compact를 허용하지 않는다.
- `threadStatus.type !== "idle"` 이면 v1에서는 compact를 막는다.
- 이미 compact 요청이 진행 중이면 동일 chat 기준으로 추가 요청을 막는다.
- compact 실행 직전 status를 한 번 더 읽어 thread 상태를 재검증한다.
- compact 요청 후 `thread/read(includeTurns=true)` 를 polling 해서 새 `contextCompaction` item 등장 여부를 확인한다.
- polling timeout 내에 compaction marker가 보이지 않더라도 thread가 다시 `idle` 이면 "실행은 수락됐지만 compaction marker 확인은 불확실" 상태를 분리해 보여준다.

### Why not use `/ws/terminal/:sessionId`?

- `services/aris-web/server.mjs` 의 `/ws/terminal/:sessionId` 는 `tmux attach-session -t <sessionId>` 또는 shell fallback 경로다.
- 현재 ARIS Codex turn 실행은 그 `tmux` 세션에서 이뤄지는 것이 아니라 backend의 detached `codex app-server --listen ...` 프로세스에서 이뤄진다.
- 즉 "현재 세션에 붙는다" 는 표현을 셸 attach로 해석하면 실제 Codex thread 상태와 어긋날 수 있다.
- `/ws/terminal/:sessionId` 는 raw debug fallback으로는 쓸 수 있어도, 상태 조회와 compact 제어의 source of truth로 쓰기엔 부적절하다.

---

### Task 1: Backend Codex status/compact transport 추가

**Files:**
- Modify: `services/aris-backend/src/runtime/contracts/providerRuntime.ts`
- Modify: `services/aris-backend/src/runtime/happyClient.ts`
- Modify: `services/aris-backend/src/types.ts`
- Modify: `services/aris-backend/src/server.ts`
- Create: `services/aris-backend/src/runtime/providers/codex/codexThreadControl.ts` (optional helper)

- [ ] **Step 1: Codex thread control helper 설계**

다음 helper를 추가한다.

- `readCodexThreadStatus({ sessionId, chatId, threadId })`
- `readCodexRateLimits()`
- `startCodexThreadCompaction({ sessionId, chatId, threadId })`

구현 원칙:

- app-server request/response 전송 로직은 `happyClient.ts` 내부 helper를 재사용하거나 별도 helper file로 분리한다.
- `thread/read` 는 기본적으로 `includeTurns=false`, compact 확인 단계에서만 `includeTurns=true` 를 사용한다.
- threadId 해석은 현재 sendTurn/recoverSession 흐름과 동일한 저장소를 재사용한다.

- [ ] **Step 2: status DTO 정의**

`types.ts` 또는 runtime contract 쪽에 Codex status DTO를 추가한다.

최소 포함 필드:

- `sessionId`, `chatId`, `threadId`
- `threadStatus`, `threadActiveFlags`
- `lastCompaction`
- `rateLimits`
- `model`, `runtimeChannel`, `statusCollectedAt`

- [ ] **Step 3: backend endpoint 추가**

Fastify에 다음 endpoint를 추가한다.

- `GET /v1/sessions/:sessionId/codex/status?chatId=...`
- `POST /v1/sessions/:sessionId/codex/compact`

`compact` body 예시:

```json
{
  "chatId": "..."
}
```

동작:

- `status`: 현재 chat thread의 snapshot 반환
- `compact`: preflight 검증 후 `thread/compact/start` 호출, accepted/result 반환

- [ ] **Step 4: compact confirmation helper 추가**

compact 실행 후 확인 로직을 helper로 캡슐화한다.

- baseline: compact 전 마지막 compaction item id 또는 count 저장
- action: `thread/compact/start`
- confirm: `thread/read(includeTurns=true)` polling
- result:
  - `confirmed`
  - `accepted_but_unconfirmed`
  - `blocked_active_turn`
  - `missing_thread`

- [ ] **Step 5: commit**

```bash
rtk git add services/aris-backend/src/runtime/contracts/providerRuntime.ts services/aris-backend/src/runtime/happyClient.ts services/aris-backend/src/types.ts services/aris-backend/src/server.ts services/aris-backend/src/runtime/providers/codex/codexThreadControl.ts
rtk git commit -m "feat(runtime): add codex status and compact control endpoints"
```

### Task 2: Web API and client wiring 추가

**Files:**
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/codex/status/route.ts`
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/codex/compact/route.ts`
- Modify: `services/aris-web/lib/happy/client.ts`
- Modify: `services/aris-web/lib/happy/types.ts`

- [ ] **Step 1: Next.js proxy route 추가**

웹 레이어에 operator auth를 유지하는 proxy route를 추가한다.

- `GET /api/runtime/sessions/[sessionId]/codex/status?chatId=...`
- `POST /api/runtime/sessions/[sessionId]/codex/compact`

- [ ] **Step 2: happy web client helper 추가**

`services/aris-web/lib/happy/client.ts` 에 다음 함수를 추가한다.

- `getCodexSessionStatus(sessionId, { chatId })`
- `runCodexCompact(sessionId, { chatId })`

- [ ] **Step 3: web 타입 정의 추가**

`services/aris-web/lib/happy/types.ts` 에 backend DTO와 맞는 타입을 추가한다.

- `CodexSessionStatus`
- `CodexCompactResult`

- [ ] **Step 4: commit**

```bash
rtk git add services/aris-web/app/api/runtime/sessions/[sessionId]/codex/status/route.ts services/aris-web/app/api/runtime/sessions/[sessionId]/codex/compact/route.ts services/aris-web/lib/happy/client.ts services/aris-web/lib/happy/types.ts
rtk git commit -m "feat(web): add codex status and compact api proxies"
```

### Task 3: Chat UI 상태 조회 경로 분리

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/chatCommands.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/CodexSessionStatusModal.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/codexSessionStatus.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/CodexSessionStatusModal.module.css`
- Modify: `services/aris-web/app/sessions/[sessionId]/UsageProbeModal.tsx` (optional cleanup only)

- [ ] **Step 1: 명령 모델 재정의**

현재 `status` 와 `usage` 가 같은 probe modal로 흘러가는 구조를 분리한다.

- `status`
  - Codex일 때는 새 JSON-backed status modal을 연다.
- `usage`
  - 기존 usage probe는 Claude 유지용으로 남기거나, Codex에서는 deprecated label을 준다.

- [ ] **Step 2: status modal 구현**

새 modal은 다음 블록을 렌더링한다.

- thread 상태
- active flags
- threadId / model / runtime channel
- 최근 compaction 상태
- rate limit snapshot
- refresh 버튼
- compact 버튼

- [ ] **Step 3: 현재 usage probe 한계 명시**

Codex에서 기존 `UsageProbeModal` 을 유지한다면 문구를 명확히 바꾼다.

- 현재 probe는 active thread snapshot이 아님
- raw CLI 화면 확인용 debug 도구일 뿐
- product 기능으로서의 "현재 세션 상태" 는 새 status modal 기준

- [ ] **Step 4: compact action wiring**

modal 내 compact 버튼은:

- 클릭 시 confirm UI 노출
- in-flight 동안 disable
- 성공 시 status refetch
- `blocked_active_turn` 은 안내문으로 분기

- [ ] **Step 5: commit**

```bash
rtk git add services/aris-web/app/sessions/[sessionId]/chatCommands.ts services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx services/aris-web/app/sessions/[sessionId]/CodexSessionStatusModal.tsx services/aris-web/app/sessions/[sessionId]/codexSessionStatus.ts services/aris-web/app/sessions/[sessionId]/CodexSessionStatusModal.module.css services/aris-web/app/sessions/[sessionId]/UsageProbeModal.tsx
rtk git commit -m "feat(chat): add codex session status modal"
```

### Task 4: Safe compact UX and failure handling

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/CodexSessionStatusModal.tsx`
- Modify: `services/aris-backend/src/runtime/happyClient.ts`
- Modify: related normalizers/tests

- [ ] **Step 1: preflight matrix 구현**

compact 전 다음 상태를 명시적으로 분기한다.

- `missing_chat`
- `missing_thread`
- `non_codex_agent`
- `active_turn`
- `ready`

- [ ] **Step 2: duplicate request guard 구현**

frontend는 modal 단위 lock, backend는 `sessionId + chatId` 단위 guard를 둔다.

- 같은 chat에서 동시에 두 번 compact 시작 금지
- polling 중 새 compact 요청 금지

- [ ] **Step 3: uncertain completion UX 추가**

`thread/compact/start` 는 빈 object를 반환하므로, 최종 결과는 세 단계로 나눈다.

- `confirmed`
- `accepted_but_unconfirmed`
- `failed`

`accepted_but_unconfirmed` 인 경우 사용자에게 새 status refresh를 유도한다.

- [ ] **Step 4: raw debug fallback은 별도 버튼으로 격리**

필요하다면 raw `/status` 확인 버튼을 별도로 둔다.

- label 예시: `Raw CLI Status`
- 설명: 활성 thread 기준 보장이 없는 디버그 도구

- [ ] **Step 5: commit**

```bash
rtk git add -A
rtk git commit -m "feat(chat): harden codex compact workflow"
```

### Task 5: Verification

**Files:**
- Modify: focused tests only

- [ ] **Step 1: backend unit/integration 테스트**

검증 항목:

- Codex가 아닌 session에서 status/compact 거부
- missing chatId / threadId 처리
- idle thread에서 compact accepted
- active thread에서 compact blocked
- `thread/read` 결과에서 `contextCompaction` marker 추출
- rate limit snapshot 정규화

- [ ] **Step 2: web UI 테스트**

검증 항목:

- `status` 명령 클릭 시 Codex status modal 열림
- modal에서 refresh / compact 버튼 상태 전이
- active turn일 때 compact disabled
- compact 성공 후 status refetch

- [ ] **Step 3: mobile overflow 회귀 테스트**

긴 `threadId`, model id, reset text가 modal에 들어가도 가로 overflow가 없어야 한다.

Run:

```bash
rtk pnpm --filter aris-web test -- --runInBand services/aris-web/tests/mobileOverflowLayout.test.ts
```

- [ ] **Step 4: manual verification**

실운영 또는 dev session에서 확인:

1. Codex 대화가 1개 이상 진행된 chat 선택
2. status modal open
3. threadId / status / rate limits 표시 확인
4. idle 상태에서 compact 실행
5. compact 후 status refresh 및 marker 확인

- [ ] **Step 5: commit**

```bash
rtk git add -A
rtk git commit -m "test(chat): verify codex status and compact flows"
```

---

### Out of scope for v1

- CLI `/status` 와 완전히 동일한 token usage / remaining context capacity 숫자 복제
- `tmux` 셸 attach 기반 status scraping을 product source of truth로 채택하는 것
- Codex 외 provider에 동일 UX를 동시에 적용하는 것
- active turn 중 강제 compact 허용

### Follow-up spike

CLI parity가 꼭 필요하면 아래 실험을 별도 spike로 분리한다.

- `codex exec resume <threadId> --json "<prompt>"` 에 slash command가 어느 정도 유효한지 검증
- `codex debug` 또는 향후 schema 확장에서 token/capacity 메타가 노출되는지 재확인
- raw `/status` 출력 파서를 active thread와 결합할 수 있는지 검토
