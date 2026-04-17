# Chat Screen Full Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 화면 전체 구조를 `ChatInterface.tsx`/`CustomizationSidebar.tsx` 중심의 대형 파일 구조에서 섹션 컴포넌트와 도메인 훅 구조로 재편한다.

**Architecture:** 먼저 순수 상수/타입/유틸과 표시 컴포넌트를 `chat-screen/` 하위로 추출해 대형 단일 파일을 해체한다. 이후 채팅 화면 상태를 `runtime/sidebar/composer/layout/workspace` 기준의 커스텀 훅으로 이동하고, 마지막으로 `CustomizationSidebar`를 surface 단위 구조로 재분해한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Vitest, Playwright

---

## 준비: 작업 기준점 확인

**Files:**
- Reference: `docs/superpowers/specs/2026-04-17-chat-screen-full-refactor-design.md`
- Verify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Verify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`

- [ ] **Step 1: 스펙과 현재 파일 규모 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
wc -l \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx
```

Expected: `ChatInterface.tsx` 약 7,205줄, `CustomizationSidebar.tsx` 약 2,281줄

- [ ] **Step 2: 작업 브랜치 상태 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git branch --show-current
git status --short
```

Expected: branch=`refactor/chat-screen-split`, 스펙/플랜 외 의도치 않은 변경 없음

---

### Task 1: 공용 상수/타입/유틸 추출

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/constants.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/types.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/utils/chatScreenFormatting.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/utils/chatScreenPaths.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: 이동 대상 상수/타입/순수 함수 목록 정리**

Check:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
rg -n "^(const [A-Z_]|type |function (format|normalize|classify|resolveAgentMeta|resolveAgentSubtitle|fileExtension|joinWorkspacePath))" \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: 상수/타입/순수 함수 후보 목록 확인

- [ ] **Step 2: 신규 모듈 작성**

Implement:

- `constants.ts`에 layout width, debounce/timeout, sidebar labels, model effort 옵션, quick-start 상수 이동
- `types.ts`에 `ContextItem`, `ChatRuntimeUiState`, `ChatSidebarSnapshot`, `TimelineRenderItem` 등 타입 이동
- `chatScreenFormatting.ts`에 `formatClock`, `formatRelative`, `formatElapsedDuration` 이동
- `chatScreenPaths.ts`에 workspace path normalize/join/classify 관련 순수 함수 이동

- [ ] **Step 3: ChatInterface import 전환**

Implement:

- 기존 파일 상단의 상수/타입/함수 정의 제거
- 신규 모듈 import로 교체

- [ ] **Step 4: 타입 체크**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen
git commit -m "refactor: extract chat screen shared constants and utils"
```

---

### Task 2: 타임라인 렌더러 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/ResourceChip.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/MarkdownContent.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/TextReply.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/LinkPreviewCarousel.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/DebugReply.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/ActionEventCard.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers/CodeChangesEventCard.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: 렌더러 함수 경계 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
rg -n "^(function (ResourceChip|InlineResourceChip|ResourceLabelStrip|MarkdownContent|TextReply|YouTubeCard|GitHubCard|GenericCard|LinkPreviewCarousel|DebugRawBody|DebugReply|ActionResultDetail|DiffCodeBlock|CodeChangesEventCard|ActionEventCard))" \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: 렌더러 함수 시작 위치 확인

- [ ] **Step 2: 표시 컴포넌트 파일로 추출**

Implement:

- 타임라인 카드 하위 렌더러를 `center-pane/renderers/`로 이동
- 기존 동작 보존을 위해 props 타입을 명시적으로 정의
- 필요한 helper만 import로 연결

- [ ] **Step 3: ChatInterface에서 렌더러 import 사용**

Implement:

- 추출한 함수 본문 제거
- import 교체

- [ ] **Step 4: 타임라인 관련 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- tests/chatTimeline.test.ts tests/chatScroll.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/renderers
git commit -m "refactor: split chat timeline renderers"
```

---

### Task 3: 좌측 사이드바 뷰 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarPane.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarSection.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarItem.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarActionMenu.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: 좌측 사이드바 JSX 블록 범위 확인**

Check:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
sed -n '5790,6075p' services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: sidebar / action menu 렌더링 블록 확인

- [ ] **Step 2: sidebar 표시 컴포넌트 추출**

Implement:

- 섹션 헤더, 아이템, 액션 메뉴를 별도 컴포넌트로 이동
- 이벤트 핸들러와 파생 값은 props로 전달

- [ ] **Step 3: sidebar 관련 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- tests/chatSidebarRoute.test.ts tests/chatSidebarReadMarker.test.ts tests/chatSelection.test.ts
```

Expected: PASS

- [ ] **Step 4: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/left-sidebar
git commit -m "refactor: extract chat sidebar view components"
```

---

### Task 4: 컴포저 및 파일 브라우저 모달 뷰 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/FileBrowserModal.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: 컴포저와 파일 모달 JSX 경계 확인**

Check:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
sed -n '6670,7198p' services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: composer/form/file modal 렌더링 블록 확인

- [ ] **Step 2: 표시 컴포넌트 추출**

Implement:

- `ChatComposer.tsx`에 form, prompt, plus menu, attachments UI 이동
- `FileBrowserModal.tsx`에 파일 탐색 modal UI 이동

- [ ] **Step 3: 컴포저 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- tests/chatComposer.test.ts tests/chatComposerLayout.test.ts tests/chatComposerDockLayout.test.ts
```

Expected: PASS

- [ ] **Step 4: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane
git commit -m "refactor: split chat composer and file browser modal"
```

---

### Task 5: 채팅 화면 상태 훅 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatRuntimeUi.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useComposerState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useWorkspaceBrowserState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatLayoutState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatScreenState.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: runtime/sidebar/composer/layout state 선언 범위 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
rg -n "const \\[|useEffect\\(|useMemo\\(|useCallback\\(" \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: 훅 후보 상태 선언과 effect 위치 확인

- [ ] **Step 2: 도메인별로 훅 추출**

Implement:

- 제출/중단/awaiting/disconnect 상태는 `useChatRuntimeUi`
- sidebar snapshot/read marker/grouping 상태는 `useChatSidebarState`
- prompt/context/model/image upload 상태는 `useComposerState`
- file browser/search/recent attachments는 `useWorkspaceBrowserState`
- viewport/customization overlay/layout metric은 `useChatLayoutState`
- selected chat/home/new chat placeholder/URL sync는 `useChatScreenState`

- [ ] **Step 3: 채팅 핵심 테스트 묶음 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- \
  tests/chatSubmitPayload.test.ts \
  tests/chatRuntime.test.ts \
  tests/chatSelection.test.ts \
  tests/chatScrollRestoreAnchor.test.ts
```

Expected: PASS

- [ ] **Step 4: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/hooks
git commit -m "refactor: move chat screen state into domain hooks"
```

---

### Task 6: CustomizationSidebar surface 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/right-pane/CustomizationSidebarContainer.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationOverviewState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationGitState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationModalState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/sections/CustomizationOverviewSection.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/sections/CustomizationFilesSection.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/sections/CustomizationGitSection.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: CustomizationSidebar state와 surface 경계 확인**

Check:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
rg -n "const \\[|useEffect\\(|useMemo\\(|useCallback\\(|SURFACE_" \
  services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx
```

Expected: overview/files/git/modal 단위 경계 확인

- [ ] **Step 2: surface와 하위 훅으로 분리**

Implement:

- overview/files/git/modal 상태를 각각 하위 훅으로 이동
- section 렌더링을 files/git/customization 섹션 컴포넌트로 분리
- 기존 `CustomizationSidebar.tsx`는 container 수준으로 축소

- [ ] **Step 3: lint 및 타입 체크**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm run lint
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 4: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/right-pane \
  services/aris-web/app/sessions/[sessionId]/customization-sidebar
git commit -m "refactor: split customization sidebar by surface"
```

---

### Task 7: 최종 검증

**Files:**
- Test: `services/aris-web/tests/*.test.ts`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`
- Test: `services/aris-web/tests/e2e/mobile-overflow.spec.ts`

- [ ] **Step 1: 핵심 단위 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- \
  tests/chatComposer.test.ts \
  tests/chatTimeline.test.ts \
  tests/chatSidebarRoute.test.ts \
  tests/chatSidebarReadMarker.test.ts \
  tests/chatRuntime.test.ts \
  tests/chatScroll.test.ts
```

Expected: PASS

- [ ] **Step 2: 모바일 overflow 단위 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm test -- tests/mobileOverflowLayout.test.ts
```

Expected: PASS

- [ ] **Step 3: 모바일 overflow E2E 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor/services/aris-web
npm run test:e2e:mobile-overflow
```

Expected: PASS

- [ ] **Step 4: 최종 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git add -A
git commit -m "refactor: reorganize chat screen architecture"
```

- [ ] **Step 5: 원격 브랜치 푸시**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor
git push -u origin refactor/chat-screen-split
```

Expected: branch pushed successfully
