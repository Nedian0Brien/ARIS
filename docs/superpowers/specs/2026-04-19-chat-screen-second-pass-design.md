# Design: Chat Screen Second-Pass Refactor

**Date:** 2026-04-19  
**Scope:** 1차 리팩토링 이후 남아 있는 `ChatInterface.tsx` orchestration과 숨은 대형 모듈을 2차로 재분해  
**Branch:** `refactor/chat-screen-second-pass`  
**Worktree:** `/home/ubuntu/project/ARIS/.worktrees/chat-screen-second-pass`

---

## 목표

1차 리팩토링으로 채팅 화면의 대형 단일 파일은 크게 줄었지만, 최상위 오케스트레이터와 일부 훅/헬퍼에 아직 많은 책임이 남아 있다.

현재 기준 주요 파일 규모는 다음과 같다.

- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx` — 3,142줄
- `services/aris-web/app/sessions/[sessionId]/chat-screen/helpers.tsx` — 1,091줄
- `services/aris-web/app/sessions/[sessionId]/chat-screen/hooks/useChatSidebarState.ts` — 830줄
- `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx` — 919줄
- `services/aris-web/app/sessions/[sessionId]/customization-sidebar/hooks/useCustomizationFilesState.ts` — 463줄

이번 2차 리팩토링의 목표는 기능 변경 없이 아래 상태를 만드는 것이다.

1. `ChatInterface.tsx`는 세션 props 수신, 상위 훅 연결, pane 조립만 담당한다.
2. center/right pane 렌더링 트리와 submit/abort/retry/scroll wiring을 별도 경계로 이동한다.
3. `helpers.tsx`를 도메인별 모듈로 쪼개서 공용 유틸이 다시 god file이 되지 않게 한다.
4. `useChatSidebarState.ts`와 `useCustomizationFilesState.ts`를 저장 상태 / 파생 상태 / 동기화 effect 기준으로 다시 자른다.
5. 모바일 scroll restoration, permission queue, overflow 회귀를 기존 수준 이상으로 방어한다.

## 비목표

이번 작업에서 하지 않는 일은 아래와 같다.

- API 계약 변경
- UI/스타일 재디자인
- 채팅 이벤트 모델 변경
- 새 채팅 기능 추가
- 우측 패널 surface 자체의 기능 확장
- 채팅 화면 밖 다른 화면 구조 개편

---

## 현재 구조 진단

### 1. `ChatInterface.tsx`

1차 리팩토링 이후에도 아래 책임이 한 파일에 함께 남아 있다.

- center pane header / notice / timeline / composer / workspace pager 렌더링
- submit / retry / abort / disconnect notice 흐름 제어
- tail restore 이후의 scroll button, load older, composer dock metric, viewport effect 제어
- permission queue 이동과 context menu wiring
- overlay mode / pinned mode / workspace panel page 전환 연결

즉, 지금의 `ChatInterface.tsx`는 “상위 조립자”이면서 동시에 “center pane runtime controller” 역할도 수행한다. 이 상태에서는 타임라인 수정, scroll 수정, permission UI 수정이 같은 파일 안에서 충돌한다.

### 2. `chat-screen/helpers.tsx`

이 파일은 순수 함수 모음이라는 이름과 달리 아래 서로 다른 성격의 로직을 동시에 포함한다.

- browser/clipboard/localStorage helper
- workspace path helper
- agent / model / gemini mode 해석
- event preview / summary / progress helper
- stream render item 조립
- sidebar snapshot helper

이 구조는 재사용성은 높지만 변경 영향을 예측하기 어렵고, 작은 helper 추가가 파일 전체 복잡도를 계속 키운다.

### 3. `useChatSidebarState.ts`

한 훅 안에 아래 책임이 섞여 있다.

- snapshot/read marker 저장 상태
- approval feedback timer
- unread / run phase / section 상태 계산
- 서버 동기화 effect
- mutation 결과를 반영하는 bridge state

즉 “state storage”, “derived view model”, “effectful sync”가 한 훅에 섞여 있어 사이드바 회귀 분석이 어렵다.

### 4. `useCustomizationFilesState.ts`

이 훅은 우측 패널 files surface 안에서 아래 책임을 동시에 가진다.

- directory loading / focus path 관리
- search result 관리
- file modal open / file content load / save
- file action dialog / rename-create-delete 처리
- copy status / preview block / nav history 유지

files surface가 계속 자라면 이 훅이 다음 대형 병목이 될 가능성이 높다.

---

## 선택한 방향

채택한 방향은 “상위 오케스트레이터를 더 얇게 만들고, 숨은 대형 모듈을 도메인별로 다시 자르는 2차 구조 정리”다.

핵심 원칙은 아래와 같다.

1. 1차 리팩토링의 경계를 뒤엎지 않고, 남은 책임만 추가 분해한다.
2. `ChatInterface.tsx`에서는 “무엇을 렌더링하는가”와 “무엇이 동작하게 하는가”를 분리한다.
3. 훅은 저장 상태, 파생 계산, 부수효과를 섞지 않는다.
4. helper는 폴더 단위로 책임을 나누고 import 집합으로 다시 묶을 수 있게 한다.
5. 모바일 scroll/overflow 회귀 방지가 구조 개선보다 우선한다.

---

## 목표 구조

### 최상위 엔트리

`services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- 역할: 얇은 session shell
- 책임:
  - 서버 props 수신
  - 상위 상태 훅 호출
  - left / center / right pane 조립
  - cross-pane 이벤트만 연결

이 파일은 최종적으로 “화면의 큰 블록을 어떤 props로 묶는지”만 읽히는 상태를 목표로 한다.

### 신규 / 재구성 후보 구조

```text
services/aris-web/app/sessions/[sessionId]/
  chat-screen/
    actions/
      useChatSessionActions.ts
      useChatRunActions.ts
    center-pane/
      ChatCenterPane.tsx
      ChatHeader.tsx
      ChatStatusNotices.tsx
      ChatTimeline.tsx
      ChatTimelineItem.tsx
      ChatComposer.tsx
      FileBrowserModal.tsx
      WorkspacePagerShell.tsx
    hooks/
      useChatScreenState.ts
      useChatRuntimeUi.ts
      useChatSidebarState.ts
      useComposerState.ts
      useWorkspaceBrowserState.ts
      useChatLayoutState.ts
      useChatViewportEffects.ts
      useChatPermissionUi.ts
    helpers/
      browser.ts
      events.ts
      models.ts
      paths.ts
      sidebar.ts
      stream.ts
      index.ts
    left-sidebar/
      ...
    right-pane/
      RightPaneLayout.tsx
      WorkspacePanelsPane.tsx
      CustomizationSidebarContainer.tsx
```

실제 파일명은 구현 중 미세 조정될 수 있지만, 경계는 위와 같이 유지한다.

---

## 분해 기준

### 1. Center pane 렌더링 분리

`ChatInterface.tsx`에서 먼저 떼어낼 대상은 렌더링 덩어리다.

- `ChatHeader`
  - 세션/에이전트 표기
  - debug toggle
  - connection pill
  - context menu trigger
- `ChatStatusNotices`
  - runtime notice
  - disconnect notice
  - pending permission notice
- `ChatTimeline`
  - empty state / permission queue / stream / running bubble / scroll-to-bottom button
- `ChatCenterPane`
  - header + notices + timeline + composer + transition overlay 조립
- `WorkspacePagerShell`
  - chat/create/panel page routing과 pager shell 연결

이 단계의 목표는 JSX 큰 블록을 나누는 것이고, 상태 소유권 이동은 최소화한다.

### 2. Run/scroll/permission orchestration 분리

그 다음으로 `ChatInterface.tsx` 안의 event wiring을 이동한다.

- `useChatRunActions`
  - submit / retry / abort / disconnect recovery
  - runtime UI patching
  - optimistic submit / last payload / error reset
- `useChatViewportEffects`
  - scroll-to-bottom button
  - load older trigger
  - composer dock metric
  - mobile/window scroll listeners
  - tail restore 주변 settle effect
- `useChatPermissionUi`
  - permission queue open/close
  - first pending permission jump
  - pending permission banner 관련 로직

이 단계 후 `ChatInterface.tsx`는 로컬 `useEffect`/`useCallback` 수가 크게 줄어야 한다.

### 3. Helper 폴더 재구성

`helpers.tsx`는 성격별 파일로 쪼갠다.

- `helpers/paths.ts`
  - workspace path normalize/join/open
- `helpers/browser.ts`
  - clipboard / local storage / history write
- `helpers/models.ts`
  - model / gemini mode / agent meta 해석
- `helpers/events.ts`
  - event kind, preview, summary, progress, error signal
- `helpers/sidebar.ts`
  - read marker / snapshot / recent summary
- `helpers/stream.ts`
  - render item 조립과 stream 계산
- `helpers/index.ts`
  - 기존 import 호환을 위한 re-export 진입점

초기 단계에서는 `index.ts`를 유지해 import churn을 줄이고, 이후 점진적으로 직접 import로 바꾼다.

### 4. `useChatSidebarState.ts` 재분해

이 훅은 아래 계층으로 나눈다.

- `useChatSidebarStorage`
  - snapshots / read markers / approval feedback 저장 상태
- `useChatSidebarDerivedState`
  - unread / run phase / section / preview 계산
- `useChatSidebarSyncEffects`
  - 서버 sync / timer cleanup / auxiliary leader effect
- `useChatSidebarState`
  - 위 훅을 묶는 facade

상위에서는 기존 `useChatSidebarState` 인터페이스를 최대한 유지해서 `ChatInterface` 변경 폭을 줄인다.

### 5. `useCustomizationFilesState.ts` 재분해

files surface는 아래처럼 자른다.

- `useCustomizationFileTreeState`
  - directory load / expansion / focus
- `useCustomizationFileSearchState`
  - search query / result / loading
- `useCustomizationFileEditorState`
  - file modal open / load / save / dirty / nav history
- `useCustomizationFileActionState`
  - create / rename / delete dialog와 실행

이 단계는 우측 패널 구조를 더 세분화하되, 외부 surface API는 보존하는 방향으로 진행한다.

---

## 구현 순서

### Phase 1. `ChatInterface` 렌더링 덩어리 분리

목표:

- `ChatCenterPane`, `ChatHeader`, `ChatStatusNotices`, `ChatTimeline`, `WorkspacePagerShell`, `RightPaneLayout` 생성
- `ChatInterface.tsx`에서 JSX 블록 제거

완료 기준:

- `ChatInterface.tsx` line count가 유의미하게 감소
- state ownership 변화 없이 렌더링 구조만 분리됨

### Phase 2. orchestration 훅 분리

목표:

- submit/retry/abort/disconnect 흐름을 `useChatRunActions`로 이동
- scroll/viewport/tail settle 관련 effect를 `useChatViewportEffects`로 이동
- permission jump/banner logic을 `useChatPermissionUi`로 이동

완료 기준:

- `ChatInterface.tsx`의 `useEffect`/`useCallback` 수가 크게 줄어듦
- disconnect/scroll/permission 회귀 없음

### Phase 3. helper 모듈 분리

목표:

- `helpers.tsx`를 helpers 폴더로 나누고 `index.ts` re-export로 연결

완료 기준:

- helper 파일이 도메인별로 분리
- 기존 동작과 타입 유지

### Phase 4. sidebar/files 훅 재분해

목표:

- `useChatSidebarState.ts`와 `useCustomizationFilesState.ts` 내부 경계 재설정

완료 기준:

- 각 훅의 내부 책임이 저장 상태 / 파생 상태 / effect 기준으로 나뉨
- 외부 API는 가능하면 유지

### Phase 5. 최종 검증과 정리

목표:

- 채팅 핵심 단위 테스트
- 모바일 overflow 단위/E2E
- line count와 책임 맵 재정리

완료 기준:

- 타입 체크 / lint / 주요 테스트 / mobile overflow E2E 통과

---

## 테스트 전략

각 phase 종료 시 아래 검증을 반복한다.

### 타입/정적 검증

- `npx tsc --noEmit`
- `npm run lint`

### 채팅 핵심 단위 테스트

- `tests/chatComposer.test.ts`
- `tests/chatTimeline.test.ts`
- `tests/chatSidebarView.test.ts`
- `tests/chatSidebarReadMarker.test.ts`
- `tests/chatRuntime.test.ts`
- `tests/chatScroll.test.ts`
- 필요 시 `tests/chatSelection.test.ts`

### 모바일 회귀 방지

프로젝트 규칙에 따라 모바일 UI/긴 텍스트 수정이 포함되므로 아래 검증을 최종 완료 전에 반드시 실행한다.

- `tests/mobileOverflowLayout.test.ts`
- `tests/e2e/mobile-overflow.spec.ts`

추가로 scroll/tail restore 관련 회귀가 보이면 아래 테스트도 함께 묶는다.

- `tests/chatScrollRestoreAnchor.test.ts`
- `tests/chatComposerDockLayout.test.ts`

---

## 리스크와 대응

### 1. scroll/tail restore 회귀

가장 큰 리스크다. 렌더링 분리와 effect 이동이 동시에 일어나면 모바일/데스크톱 scroll 기준점이 어긋날 수 있다.

대응:

- Phase 1에서는 render split만 하고 scroll ownership은 옮기지 않는다.
- Phase 2에서만 scroll/effect ownership을 이동한다.
- mobile overflow / scroll restore 테스트를 phase 후반마다 반복한다.

### 2. props drilling 증가

render split 과정에서 props가 늘어날 수 있다.

대응:

- 일단 props drilling을 허용하고, state ownership 혼합을 막는 쪽을 우선한다.
- 공용 인터페이스가 안정되면 pane-level prop object로 정리한다.

### 3. helper 분리 중 import churn

많은 import 경로가 동시에 바뀌면 diff noise가 커진다.

대응:

- `helpers/index.ts` re-export layer를 먼저 만든 뒤 점진적으로 direct import로 전환한다.

### 4. sidebar/files 훅 재분해 시 외부 계약 흔들림

상위 consumer까지 동시 수정되면 회귀 범위가 커진다.

대응:

- facade 훅을 유지하고 내부만 재구성한다.
- 외부 반환 shape 변경은 마지막 단계에서만 검토한다.

---

## 완료 후 기대 상태

2차 리팩토링이 끝나면 다음 상태를 기대한다.

- `ChatInterface.tsx`는 session shell 수준으로 축소된다.
- center pane 수정은 center-pane 계층만 보면 된다.
- scroll/disconnect/permission 관련 이슈는 orchestration 훅 안에서 추적 가능해진다.
- helper와 sidebar/files 훅이 다시 커지는 구조를 예방한다.
- 이후 채팅 기능 추가 시 “거대한 상위 파일을 다시 열어야 하는 비용”이 더 줄어든다.

## 관련 문서

- `docs/superpowers/specs/2026-04-17-chat-screen-full-refactor-design.md`
- `docs/superpowers/plans/2026-04-17-chat-screen-full-refactor.md`
- OpenContext: [chat-screen-refactor-final-structure](oc://doc/cc3882a4-185d-47a2-ba27-ff9bc96b2a29)
