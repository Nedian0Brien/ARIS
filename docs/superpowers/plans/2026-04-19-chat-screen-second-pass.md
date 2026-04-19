# Chat Screen Second-Pass Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1차 리팩토링 이후 남아 있는 `ChatInterface.tsx` orchestration과 숨은 대형 모듈을 2차로 재분해해, 상위 엔트리를 더 얇은 session shell로 만든다.

**Architecture:** 먼저 `ChatInterface.tsx`의 center/right pane 렌더링 덩어리를 별도 컴포넌트로 추출해 JSX 경계를 분리한다. 다음으로 submit/abort/retry/scroll/permission wiring을 전용 훅으로 이동하고, 이후 `helpers.tsx`, `useChatSidebarState.ts`, `useCustomizationFilesState.ts`를 도메인 기준으로 다시 나눈다.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Vitest, Playwright

---

## 준비: 작업 기준점 확인

**Files:**
- Reference: `docs/superpowers/specs/2026-04-19-chat-screen-second-pass-design.md`
- Verify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Verify: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers.tsx`
- Verify: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts`
- Verify: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts`

- [ ] **Step 1: 스펙과 현재 파일 규모 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
wc -l \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/helpers.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts \
  services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx \
  services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts
```

Expected: 스펙에 적은 기준 line count와 대체로 일치

- [ ] **Step 2: 작업 브랜치 상태 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git branch --show-current
git status --short
```

Expected: branch=`refactor/chat-screen-second-pass`, 스펙/플랜 외 의도치 않은 변경 없음

---

### Task 1: `ChatInterface` 렌더링 덩어리 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/ChatHeader.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/ChatStatusNotices.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/ChatCenterPane.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/WorkspacePagerShell.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/right-pane/RightPaneLayout.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/right-pane/WorkspacePanelsPane.tsx`
- Test: `services/aris-web/tests/chatTimeline.test.ts`
- Test: `services/aris-web/tests/chatComposerView.test.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: center/right pane JSX 경계 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
sed -n '2300,3142p' services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: header / notices / timeline / composer / workspace pager / right pane가 한 덩어리로 보임

- [ ] **Step 2: `ChatHeader.tsx`와 `ChatStatusNotices.tsx`를 추출**

Implement:

- 세션/에이전트 헤더, debug toggle, connection pill, context menu trigger는 `ChatHeader.tsx`로 이동
- runtime notice, disconnect notice, permission notice는 `ChatStatusNotices.tsx`로 이동
- 상태 소유권은 바꾸지 말고 필요한 값/핸들러만 props로 전달

- [ ] **Step 3: `ChatTimeline.tsx`와 `ChatCenterPane.tsx`를 추출**

Implement:

- empty state / permission queue / stream / running bubble / scroll-to-bottom button은 `ChatTimeline.tsx`로 이동
- header + notices + timeline + composer + transition overlay 조립은 `ChatCenterPane.tsx`로 이동
- `ChatComposer.tsx`와 기존 renderers를 재사용하고 JSX만 옮긴다

- [ ] **Step 4: `WorkspacePagerShell.tsx`, `RightPaneLayout.tsx`, `WorkspacePanelsPane.tsx`를 추출**

Implement:

- `WorkspacePager`의 chat/create/panel page 분기를 `WorkspacePagerShell.tsx`로 이동
- overlay/right-panel 중복 렌더링을 `RightPaneLayout.tsx`로 이동
- create page / panel page의 패널 렌더링을 `WorkspacePanelsPane.tsx`로 묶는다

- [ ] **Step 5: center pane 렌더링 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npm test -- \
  tests/chatTimeline.test.ts \
  tests/chatComposerView.test.ts \
  tests/chatRuntime.test.ts
```

Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane \
  services/aris-web/app/sessions/[sessionId]/chat-screen/right-pane
git commit -m "refactor: split chat interface pane rendering"
```

---

### Task 2: run/scroll/permission orchestration 훅 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/actions/useChatRunActions.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatViewportEffects.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatPermissionUi.ts`
- Test: `services/aris-web/tests/chatRuntime.test.ts`
- Test: `services/aris-web/tests/chatScroll.test.ts`
- Test: `services/aris-web/tests/chatScrollRestoreAnchor.test.ts`
- Test: `services/aris-web/tests/chatStateHooksRefactor.test.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- [ ] **Step 1: orchestration 이동 대상 함수/이펙트 범위 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
rg -n "handleSubmit|handleRetryDisconnected|handleAbortRun|handleStreamScroll|loadOlderHistory|jumpToPendingPermission|disconnectNoticeAwaitingRef|scrollConversationToBottom|useEffect\\(" \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx
```

Expected: submit/retry/abort/scroll/permission 관련 뭉친 범위 확인

- [ ] **Step 2: `useChatRunActions.ts`를 작성**

Implement:

- `handleSubmit`, `handleRetryDisconnected`, `handleAbortRun`과 이들과 결합된 runtime UI patching을 이동
- optimistic submit / error reset / disconnect recovery 책임을 이 훅으로 모은다
- 기존 `useChatSessionActions`와 충돌하지 않게 “run lifecycle 전용” 경계만 만든다

- [ ] **Step 3: `useChatViewportEffects.ts`를 작성**

Implement:

- load older, scroll-to-bottom button, composer dock metric, mobile/window scroll listener, tail settle 주변 effect를 이동
- DOM ref와 setter는 상위에서 주입하되, effect 등록/cleanup은 훅이 맡는다

- [ ] **Step 4: `useChatPermissionUi.ts`를 작성**

Implement:

- pending permission banner, queue open/close, first pending permission jump를 이동
- permission 관련 지역 state와 callback을 한곳에 모은다

- [ ] **Step 5: runtime/scroll 관련 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npm test -- \
  tests/chatRuntime.test.ts \
  tests/chatScroll.test.ts \
  tests/chatScrollRestoreAnchor.test.ts \
  tests/chatStateHooksRefactor.test.ts
```

Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen/actions/useChatRunActions.ts \
  services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatViewportEffects.ts \
  services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatPermissionUi.ts
git commit -m "refactor: move chat orchestration into focused hooks"
```

---

### Task 3: `helpers.tsx`를 도메인별 helper 폴더로 분리

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/browser.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/events.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/models.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/paths.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/sidebar.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/stream.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers/index.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/chat-screen/**/*.tsx`

- [ ] **Step 1: helper 함수 책임별 분류표 작성**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
rg -n "^export function " services/aris-web/app/sessions/[sessionId]/chat-screen/helpers.tsx
```

Expected: path/browser/model/event/sidebar/stream 계열로 묶을 함수 목록 확인

- [ ] **Step 2: helper 하위 파일과 `index.ts`를 작성**

Implement:

- path/browser/model/event/sidebar/stream 계열 함수를 새 파일로 이동
- `helpers/index.ts`에서 re-export 하도록 구성
- 초기 단계에서는 `helpers.tsx`를 thin compatibility layer로 두거나 `index.ts`로 import를 전환한다

- [ ] **Step 3: 기존 import를 안전하게 전환**

Implement:

- `ChatInterface.tsx`, renderers, sidebar, composer, customization 파일들이 새 helper 진입점을 사용하도록 교체
- 한 번에 direct import까지 밀지 말고 diff noise가 커지면 `index.ts` 재수출을 먼저 사용한다

- [ ] **Step 4: helper 관련 테스트 및 타입 체크 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npx tsc --noEmit
npm test -- \
  tests/chatTimeline.test.ts \
  tests/chatRuntime.test.ts \
  tests/chatSelection.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add services/aris-web/app/sessions/[sessionId]/chat-screen/helpers* \
  services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
  services/aris-web/app/sessions/[sessionId]/chat-screen
git commit -m "refactor: split chat screen helpers by domain"
```

---

### Task 4: `useChatSidebarState.ts`를 저장/파생/effect 계층으로 재분해

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarStorage.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarDerivedState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarSyncEffects.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts`
- Test: `services/aris-web/tests/chatSidebarReadMarker.test.ts`
- Test: `services/aris-web/tests/chatSidebarView.test.ts`
- Test: `services/aris-web/tests/chatStateHooksRefactor.test.ts`

- [ ] **Step 1: sidebar 훅 내부 책임 경계 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
sed -n '1,260p' services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts
sed -n '260,830p' services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts
```

Expected: storage / derived / sync effect 성격이 섞여 있는 지점 확인

- [ ] **Step 2: `useChatSidebarStorage.ts`와 `useChatSidebarDerivedState.ts`를 작성**

Implement:

- snapshot/read marker/approval feedback 저장은 storage 훅으로 이동
- unread/run phase/section/preview 계산은 derived 훅으로 이동
- 상태 shape와 selector 인터페이스를 명시적으로 정의

- [ ] **Step 3: `useChatSidebarSyncEffects.ts`를 작성하고 facade 정리**

Implement:

- 서버 sync, timer cleanup, auxiliary sync leader 관련 effect를 sync 훅으로 이동
- 기존 `useChatSidebarState`는 내부 훅을 조립해 외부 인터페이스를 유지한다

- [ ] **Step 4: sidebar 관련 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npm test -- \
  tests/chatSidebarReadMarker.test.ts \
  tests/chatSidebarView.test.ts \
  tests/chatStateHooksRefactor.test.ts \
  tests/chatSelection.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebar*
git commit -m "refactor: split chat sidebar state internals"
```

---

### Task 5: `useCustomizationFilesState.ts`를 files surface 전용 하위 훅으로 재분해

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFileTreeState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFileSearchState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFileEditorState.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFileActionState.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`
- Test: `services/aris-web/tests/chatStateHooksRefactor.test.ts`

- [ ] **Step 1: files surface 훅 내부 책임 경계 확인**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
sed -n '1,240p' services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts
sed -n '240,520p' services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts
```

Expected: tree/search/editor/action 경계 후보 확인

- [ ] **Step 2: tree/search/editor/action 하위 훅을 작성**

Implement:

- directory loading/expansion/focus는 tree 훅으로 이동
- search query/result/loading은 search 훅으로 이동
- file modal open/load/save/dirty/nav history는 editor 훅으로 이동
- create/rename/delete dialog와 실행은 action 훅으로 이동

- [ ] **Step 3: `useCustomizationFilesState.ts`를 facade로 정리**

Implement:

- 외부 surface API는 최대한 유지
- `CustomizationSidebar.tsx` 변경은 최소화하고 내부 조립만 바꾼다

- [ ] **Step 4: 타입 체크 및 우측 패널 관련 테스트 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npx tsc --noEmit
npm test -- \
  tests/chatComposerView.test.ts \
  tests/chatTimeline.test.ts \
  tests/chatStateHooksRefactor.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFile* \
  services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts \
  services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx
git commit -m "refactor: split customization files state internals"
```

---

### Task 6: 최종 검증과 브랜치 정리

**Files:**
- Test: `services/aris-web/tests/*.test.ts`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`
- Test: `services/aris-web/tests/e2e/mobile-overflow.spec.ts`
- Modify: `docs/superpowers/specs/2026-04-19-chat-screen-second-pass-design.md`

- [ ] **Step 1: 타입 체크와 lint 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npx tsc --noEmit
npm run lint
```

Expected: no new errors

- [ ] **Step 2: 채팅 핵심 단위 테스트 묶음 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npm test -- \
  tests/chatComposer.test.ts \
  tests/chatComposerView.test.ts \
  tests/chatTimeline.test.ts \
  tests/chatSidebarView.test.ts \
  tests/chatSidebarReadMarker.test.ts \
  tests/chatRuntime.test.ts \
  tests/chatScroll.test.ts \
  tests/chatScrollRestoreAnchor.test.ts \
  tests/chatSelection.test.ts \
  tests/chatStateHooksRefactor.test.ts
```

Expected: PASS

- [ ] **Step 3: 모바일 overflow 검증 실행**

Run:

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass/services/aris-web
npm test -- tests/mobileOverflowLayout.test.ts
npm run test:e2e:mobile-overflow
```

Expected: PASS

- [ ] **Step 4: 스펙 문서에 최종 구조/검증 결과를 반영**

Implement:

- 실제 생성된 파일명과 최종 경계를 스펙 문서에 반영
- 초기 설계와 달라진 점이 있으면 이유를 짧게 남긴다

- [ ] **Step 5: 최종 커밋**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git add -A
git commit -m "refactor: complete chat screen second-pass cleanup"
```

- [ ] **Step 6: 원격 브랜치 푸시**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass
git push -u origin refactor/chat-screen-second-pass
```

Expected: branch pushed successfully
