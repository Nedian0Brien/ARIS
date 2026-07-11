# 채팅 화면 Workspace 사이드바 실동작 전환 설계

작성: 2026-07-11 · 상태: 확정 (사용자 결정 3건 반영)
선행 조사: 사이드바 플레이스홀더 전수 점검 (2026-07-11) + 백엔드 API 지도·웹 데이터 계층·usage 데이터 가용성 조사

## 0. 목표와 원칙

목표: 채팅 화면 우측 Workspace 사이드바(6탭 + 상태바 + 푸터)와 Preview 시스템을 **전부 실데이터·실동작**으로 전환한다. 대상은 `design/chat-prototype.html`에서 포팅될 때 목업인 채 방치된 부분 전체다.

원칙:

1. **가짜 수치 즉시 제거.** 실데이터가 준비되기 전까지는 그 자리를 비우거나 숨긴다. 지어낸 숫자(`totalChats*11.8+index*7.4`)가 실측처럼 보이는 것이 빈 화면보다 나쁘다.
2. **기존 인프라 우선 재사용.** 터미널 실행 엔드포인트, git overview/diff/액션 라우트, preview-url 빌더가 이미 존재한다. 새 백엔드 공사는 usage 파이프라인과 preview 프록시 라우트 두 곳뿐이다.
3. **폴링 채널 신설 금지.** 기존 채널 — runtime 3s poll(`useSessionRuntime`) + WS nudge, events 3.5s poll, 탭 활성화 시 단발 fetch — 에 편승한다.
4. **컴포넌트 추출 선행.** `ProjectChatSurface.tsx`(3,829줄, AGENTS.md 800줄 기준 초과)에서 사이드바를 먼저 분리해 이후 PR들의 충돌 표면을 줄인다.

사용자 결정 (2026-07-11):

- Terminal: **원샷 커맨드 러너** (PTY 아님)
- Preview: **dev 서버 프록시 + 파일 렌더 폴백**
- 사용량: **신규 런부터만** (과거 로그 백필 안 함)

## 1. 현황 — 조사로 확정된 사실

| 항목 | 현재 상태 | 사용할 기존 인프라 |
|------|----------|------------------|
| Files 탭 | 정상 (실 FS API + 편집/저장) | `/api/fs/*` + `lib/fs/pathResolver` |
| Subagents 탭 | 정상 (5s 폴링) | `/subagents` 라우트 + Prisma |
| Git 탭 | 병렬 패널에서만 동작, 일반 모드 영구 에러 | `/api/runtime/sessions/{id}/git` — **panelId 생략 시 프로젝트 루트 이미 지원** (`executionTarget.ts` `resolveProjectTarget`), `kind=diff`·POST 액션(stage/commit/push 등)도 기구현 |
| Terminal 탭 | 정적 그림. 실행 없음 | **`POST /v1/chats/:chatId/terminal/commands` 기구현** (`store.ts:896` — bash, 30s 타임아웃, 1MB 버퍼, 출력 12k 잘림, 결과를 chat event로 영구 저장). 웹 프록시 `/api/runtime/sessions/{id}/terminal`도 존재. 사이드바가 안 쓰고 있을 뿐 |
| Run 탭 | 이벤트 4건, dot 항상 done, `#0142` fallback | events 3.5s poll + `resolveProjectRunIndicator`(런 lifecycle 판정 기구현) |
| Chat history | 최근 3턴, 최고(最古) 턴 항상 "running", 모든 턴에 동일 응답 | 같은 events 배열 — 페어링 로직만 신설 |
| Context 탭 | 링 9.2% 하드코딩, 목록 하드코딩 | **없음 — 파이프라인 신설 필요** |
| tokenLabel/fileCount | `HomePageClient.tsx:373-380` 수식 조작 | 없음 — 제거 후 실측 대체 |
| 푸터 | 가짜 게이지 (width 9.2% 하드코딩) | Context 탭과 동일 데이터 |
| Preview | 그림 목업. Back 버튼 데드, 줌·스크린샷 토스트만 | `preview-url` API + `buildLocalPreviewUrl` + `rewriteLocalPreviewHtml` 존재. **`/__local_preview` 프록시 라우트 미구현**, UI 소비자 없음 |

usage 데이터 가용성 (조사 확정):

- **Codex**: app-server가 `thread/tokenUsage/updated`를 런당 ~116회 발행 — `params.tokenUsage.total.{totalTokens,inputTokens,cachedInputTokens,outputTokens,reasoningOutputTokens}`, `params.tokenUsage.last.*`, `params.tokenUsage.modelContextWindow`. 현재 `codexRuntime.ts:825`가 raw 로그로만 흘려보내고 `codexProtocolMapper.ts`에 해당 메서드 케이스가 없어 버려진다.
- **Claude**: ARIS가 import하는 transcript JSONL의 assistant 메시지에 `message.usage`(`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`)가 들어 있다(업스트림 `references/happy` 타입 정의로 확인). import 경로(`agentSessionImportWorker.ts`)에서 추출 가능. **구현 시 실제 transcript로 실측 검증 필수** — 현존 Claude parsed 로그는 스모크 수준이라 코드 리딩만으로 단정 금지.
- **Gemini**: 가용성 미확인. Phase에서 조사 항목으로 분리, 없으면 `-` 표시.
- 백엔드·DB·API 어디에도 usage 저장/노출 없음 (양 서비스 전수 grep 0건, Prisma 스키마에 컬럼 없음).

## 2. 아키텍처

### 2.1 데이터 흐름 (신설분은 굵게)

```
[Codex app-server] ─ thread/tokenUsage/updated ─▶ codexProtocolMapper (케이스 추가)
[Claude transcript JSONL] ─ message.usage ─▶ agentSessionImportWorker (추출 추가)
                                   │
                                   ▼
                     prismaStore.updateChatUsage  ──▶  Chat.usageStats (Json 컬럼 신설)
                                   │
                                   ▼
        GET /v1/sessions/:id/runtime?chatId= 응답에 usage 동봉 (기존 3s poll 편승)
                                   │
                                   ▼
        useSessionRuntime → { isRunning, usage } → ContextPane 링 / 푸터 / 상태바
```

Git·Terminal·Preview는 기존 엔드포인트에 프론트만 연결(+ preview 프록시 라우트 1개 신설).

### 2.2 컴포넌트 구조 — `components/project-chat/workspace/` 신설

```
workspace/
  WorkspaceSidebar.tsx        aside 셸: 헤더·탭·상태바·푸터. target prop으로 일반/병렬 통합
  panes/RunPane.tsx           Run 스텝 + Chat history
  panes/GitPane.tsx
  panes/TerminalPane.tsx
  panes/ContextPane.tsx
  PreviewOverlay.tsx          오버레이 + 독 칩
  hooks/useWorkspaceGit.ts    panelId nullable — 없으면 프로젝트 루트
  hooks/useTerminalRunner.ts
  hooks/useChatUsage.ts       useSessionRuntime 확장분 소비
```

핵심 타입 — 일반/병렬 분기 제거:

```ts
type WorkspaceTarget =
  | { kind: 'project'; projectId: string; chatId: string | null }
  | { kind: 'panel'; projectId: string; panelId: string; chatId: string;
      runtimeSessionId: string | null; worktreePath: string | null };
```

현재 사이드바 JSX가 일반 모드(3417행~)와 병렬 모드(2873행~)에 통째로 중복돼 있다. `WorkspaceSidebar`가 `target`을 받아 한 벌로 렌더하면 중복이 사라지고, 병렬 모드 Run/Terminal 탭 목업 문제(§3.9)는 별도 작업 없이 함께 해소된다.

## 3. 항목별 설계

### 3.1 사이드바 추출 (PR-0, 기능 변화 없음)

두 aside 블록과 Preview 오버레이를 위 구조로 기계적 이동. 기존 CSS 클래스·마크업 유지(스타일 회귀 방지). props는 현재 참조 중인 값을 그대로 전달하고, 이후 PR에서 훅으로 대체한다. 검증: `tsc` + 기존 vitest 전체 + 정적 DOM 스냅샷 비교.

### 3.2 가짜 지표 제거 (PR-1)

- `deriveProjectTokenLabel`/`deriveProjectFileCount` 삭제. 소비처 처리:
  - 홈 프로젝트 카드 stat 타일: `totalChats`(실측)·`lastActivityAt`으로 대체, 토큰/파일 타일 제거
  - 채팅 헤더 `ch__meta`, 사이드바 상태바·Run 요약 Tokens 셀: usage 연결 전까지 제거
  - Context 탭 링·푸터 게이지: "사용량 수집 준비 중" empty state로 교체 (PR-5에서 실데이터)
- Run 카드 `'#0142'` fallback → 채팅 없으면 `—`
- Context 탭 하드코딩 "Attached context" 4항목 삭제

### 3.3 Git 탭 (PR-1)

- `useWorkspaceGit(projectId, panelId | null)`: panelId 없으면 `workspacePanelId` 쿼리 생략 → 프로젝트 루트 overview. `fetchProjectPanelGitOverview`를 흡수해 이름을 `fetchWorkspaceGitOverview`로.
- 헤더에 대상 표시: `프로젝트 루트` vs `패널 워크트리 (branch)`.
- 파일 행 클릭 → `kind=diff` 조회 → 읽기 전용 diff 뷰(신규 경량 컴포넌트, 추가/삭제 라인 하이라이트). 스펙의 "+N/-N 배지"는 diff 뷰 헤더에서 표시(리스트 전체 numstat은 프로세스 비용 대비 과함 — 제외 명시).
- git overview 응답에 `trackedFileCount` 추가(`git ls-files --cached` 카운트, `lib/git/sidebar.ts` 병렬 exec 1개 추가) → 푸터 "N files" 실측 근거.
- 쓰기 액션(stage/commit/push — POST 기구현)은 이번 범위 제외. 사유: 사이드바 UX 설계(충돌·인증 처리)가 별건.

### 3.4 Run 탭 (PR-2)

- 스텝 소스: `visibleEvents` 중 작업성 이벤트(`run_execution|exec_execution|git_execution|docker_execution|command_execution|file_write|file_read|file_list`) 전체(최근 4건 제한 해제, 스크롤).
- dot 상태: `projectRunIndicator` 활성 && 마지막 이벤트 → `running`(pulse), 그 외 `done`. 스펙의 `pending`은 계획 정보가 이벤트에 없으므로 미지원 명시.
- Summary 3셀: Steps=작업 이벤트 수(실측) / Duration=`runIndicator.startedAt`부터 경과(활성 시 1s tick) / Tokens=usage 연결 전 숨김→PR-5에서 표시.
- 스텝 클릭 = 타임라인 해당 이벤트로 점프(하이라이트, 기존 `handleJumpToTurn` 메커니즘 재사용). 복사는 hover 보조 버튼으로 강등.
- 제약 명시: events poll이 `limit=40` 페이지라 장시간 런은 로드된 범위만 표시(더 보기 = 기존 `before` 커서).

### 3.5 Chat history (PR-2)

- 턴 페어링: `events`를 시간순 스캔해 각 user 이벤트에 대해 "다음 user 이벤트 전까지의 마지막 `text_reply`"를 그 턴의 응답으로 묶는 순수 함수 `pairChatTurns(events)` (단위 테스트 대상).
- state: **마지막 턴만** `projectRunActive`일 때 `running`, 나머지 항상 `answered`. Final/In-progress 배지 동일 기준.
- 노출: 최근 3 → 최근 10 + 스크롤.
- Jump: 현재 `scrollTo(top:0)`으로 뭉개져 있음 → 타임라인 내 `data-event-id` 앵커로 실제 스크롤.
- Preview 버튼은 PreviewOverlay 실물화(PR-6) 전까지 제거.

### 3.6 Files 탭 배지 (PR-3)

- `useWorkspaceGit` 결과의 `files[]`를 경로 매칭해 파일 행에 상태 배지(M/A/U/C), 디렉터리 행에 하위 변경 집계 수 배지.
- git 정보 없거나(비 git 디렉터리) 로딩 전이면 배지 없이 기존 렌더 — 배지는 순수 장식 레이어.

### 3.7 Terminal 탭 (PR-3) — 원샷 커맨드 러너

- `useTerminalRunner(target)`:
  - `run(command)` → `POST /api/runtime/sessions/{projectId}/terminal` body `{ chatId, command, runtimeSessionId? }` → `{ output, exitCode }`
  - 로컬 히스토리 `{ command, output, exitCode, startedAt, durationMs }[]` (세션 메모리, 새로고침 시 소실 — 백엔드가 chat event로 영구 기록하므로 이중 저장 안 함)
- UI: 기존 term 크롬 유지 + 하단 입력줄(실제 input, Enter 실행) + 실행 중 스피너 + 라인 스타일 prompt/output/`✓`(exit 0)/`✗`(비 0) + Clear 버튼. 12k 잘림 시 "출력이 잘렸습니다" 표시.
- 스니펫: 기본 4개 유지, "현재 명령 저장" → `localStorage` (`aris.term-snippets.{projectId}`). 삭제 가능. DB 동기화는 범위 외.
- 병렬 모드: `runtimeSessionId`에 패널 런타임 세션 전달. **검증 필수**: 백엔드 `resolveExecutionCwd`가 워크트리 cwd를 실제 적용하는지 실런으로 확인, 아니면 백엔드 cwd 해석 보강을 이 PR에 포함.
- 보안: 라우트 기존 operator 전용 유지. 실행 명령·출력이 chat event로 남아 감사 추적 가능.

### 3.8 사용량 파이프라인 (PR-4 백엔드 → PR-5 웹)

**저장 (PR-4)** — Prisma `Chat`에 `usageStats Json?` 컬럼 (마이그레이션 1건):

```ts
type ChatUsageStats = {
  provider: 'codex' | 'claude' | 'gemini';
  model: string | null;
  contextWindow: number | null;
  total: { totalTokens: number; inputTokens: number; cachedInputTokens: number;
           outputTokens: number; reasoningOutputTokens?: number };
  lastTurn: { totalTokens: number; inputTokens: number; cachedInputTokens: number;
              outputTokens: number } | null;
  updatedAt: string;
};
```

- Codex: `codexProtocolMapper.ts`에 `thread/tokenUsage/updated` 케이스 추가 → `runtimeCore` 경유 `prismaStore.updateChatUsage(chatId, stats)`. 이벤트가 런당 ~116회이므로 **스로틀(마지막 값 우선, 2s debounce + 런 종료 시 flush)**.
- Claude: `agentSessionImportWorker.ts`에서 transcript 파싱 시 assistant `message.usage` 누적 + 마지막 assistant usage를 `lastTurn`으로. `contextWindow`는 모델명→윈도 상수 맵(웹 models catalog 값 재사용 가능하면 재사용).
- Gemini: 스트림에 usage가 있는지 이 PR에서 조사만. 없으면 미지원(-).
- 백필 없음(사용자 결정). `usageStats`가 null인 채팅은 UI에서 `—`.

**노출 (PR-4)**: `GET /v1/sessions/:sessionId/runtime?chatId=` 응답에 `usage: ChatUsageStats | null` 동봉 (활성 폴링 편승 — 새 엔드포인트·폴링 없음). `chats` 목록 API에도 포함해 최초 렌더 시 표시.

**UI (PR-5)**:

- `useSessionRuntime` 반환 확장 `{ isRunning, usage }` (기존 소비처는 구조분해라 무해).
- Context 탭 링: `lastTurn.totalTokens / contextWindow` 실측 % (SVG dasharray 계산식). split: Input(cached 표기)/Output/Headroom.
- 푸터: 동일 데이터로 `used / contextWindow` + 게이지 width 실계산. "project scoped" → 실제 대상(프로젝트/패널) 표기.
- 상태바·Run 요약 Tokens: `total.totalTokens` 포맷(`128.4k`).
- "Attached context" 하드코딩 대신 실측 분해: Input(cached)/Output/Reasoning 행. 파일 단위 토큰 분해는 데이터가 없으므로 제외 명시.

### 3.9 병렬 모드 정합 (별도 PR 없음)

`WorkspaceSidebar`가 `target`으로 통합되므로: 병렬 Run 탭 = 패널 채팅 events 기반 RunPane 재사용, 병렬 Terminal = `runtimeSessionId` 전달로 워크트리에서 실행, Git·Files·Context·Subagents는 이미 target 파라미터 차이뿐.

### 3.10 Preview (PR-6) — dev 서버 프록시 + 파일 렌더 폴백

**프록시 라우트 신설**: `app/__local_preview/[sessionId]/[panelId]/[[...path]]/route.ts`

- `requireApiUser` + 패널 소유권 확인 → 패널 preview 설정(port)을 **DB에서 읽어** `127.0.0.1:{port}`로 스트리밍 프록시. HTML 응답엔 `rewriteLocalPreviewHtml`로 루트 상대 경로 재작성(헬퍼 기구현).
- **SSRF 방지**: 쿼리로 포트를 받지 않는다. 패널 레코드에 저장된 preview 설정값만 사용 — 기존 `preview-url` 라우트의 `?port=` 방식은 이 기준으로 폐기·교체.
- 127.0.0.1 고정, 리다이렉트 미추적, 응답 크기 상한.

**PreviewOverlay 실동작**:

- iframe `src` = 프록시 basePath (동일 출처이므로 Back/Forward = iframe history, Refresh = reload 실동작)
- 디바이스 토글(1200/768/390) = iframe 폭(기존 CSS 활용), 줌 = `transform: scale()` 실동작, Screenshot 버튼 삭제
- URL 바 = 실제 프록시 대상 표시
- 폴백 체인: 패널 preview 설정 없음/연결 실패 → 파일 렌더 모드(선택 파일이 HTML → `/api/fs/raw` sandbox iframe, MD → `MarkdownContent`, 이미지 → `img`) → 그것도 없으면 empty state + 안내
- 상태 기계 `closed/open/dock` 유지

## 4. PR 분할·순서·검증

| PR | 내용 | 층 | 배포 |
|----|------|----|------|
| PR-0 | 사이드바·Preview 컴포넌트 추출 (기능 동일) | web | O |
| PR-1 | 가짜 지표 제거 + Git 탭 (루트 폴백·diff 뷰·trackedFileCount) | web | O |
| PR-2 | Run 탭 실상태 + Chat history 페어링·Jump 수정 | web | O |
| PR-3 | Files 배지 + Terminal 러너 (+병렬 cwd 검증) | web(+필요시 backend) | O |
| PR-4 | usage 파이프라인: 스키마·매퍼·import·runtime API | backend | O |
| PR-5 | Context 탭·푸터·상태바 usage 실측 표시 | web | O |
| PR-6 | Preview 프록시 라우트 + 오버레이 실동작 | web | O |

각 PR: 워크트리 → `tsc --noEmit` + `vitest run` → PR → 머지 → 배포 → 실측 확인 후 다음 진행 (표준 사이클).

검증 전략:

- 순수 함수(턴 페어링, usage 정규화, 링 % 계산)는 단위 테스트.
- 정적 회귀 테스트 기존 패턴 유지(하드코딩 재유입 방지: `9.2%`·`#0142`·derive 함수 부재 단언).
- 런타임 검증: usage 체인(PR-4/5)과 terminal cwd(PR-3)는 **실런으로 로그→DB→API→UI 실측** (CLAUDE.md: 코드 리딩만으로 단정 금지).
- Preview 프록시는 로컬에서 임시 dev 서버 포트를 패널에 설정해 iframe 렌더 실측.

## 5. 리스크

| 리스크 | 완화 |
|--------|------|
| Claude transcript에 usage가 없는 변형 존재 | PR-4에서 실 transcript 실측 후 매퍼 확정. 없으면 해당 채팅 `—` |
| terminal 원샷 30s 타임아웃이 긴 명령에 부족 | 잘림·타임아웃을 UI에 정직하게 표시. 한도 상향은 후속 판단 |
| 병렬 패널 terminal cwd 미반영 가능성 | PR-3에서 실측, 필요시 백엔드 `resolveExecutionCwd` 보강 동반 |
| Codex usage 이벤트 고빈도 DB 쓰기 | 2s debounce + 종료 flush |
| 추출(PR-0) 중 스타일·동작 회귀 | 마크업/클래스 불변 이동 + 기존 테스트 + 스냅샷 비교 |
| preview 프록시 보안 | 포트 쿼리 금지(DB 설정값만), 127.0.0.1 고정, 소유권 검사, 응답 상한 |
