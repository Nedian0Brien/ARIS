# Design: Chat Screen Full Refactor

**Date:** 2026-04-17  
**Scope:** `ChatInterface.tsx` + `CustomizationSidebar.tsx` 포함 채팅 화면 전체 구조 재편  
**Branch:** `refactor/chat-screen-split`  
**Worktree:** `/home/ubuntu/project/ARIS/.worktrees/chat-screen-refactor`

---

## 목표

현재 채팅 화면은 아래 두 파일에 지나치게 많은 책임이 몰려 있다.

- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx` — 7,205줄
- `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx` — 2,281줄

이번 리팩토링의 목표는 기능 변경 없이 화면 구조를 다시 나누어 다음 상태를 만드는 것이다.

1. 상위 오케스트레이터는 라우팅, 상위 데이터 조립, 섹션 연결만 담당한다.
2. 좌측 채팅 목록, 중앙 타임라인/컴포저, 우측 커스터마이징/워크스페이스 패널이 분리된 경계에서 동작한다.
3. 사이드바 상태, 컴포저 상태, 레이아웃 상태, 워크스페이스 탐색 상태, 우측 패널 상태가 각각 커스텀 훅으로 이동한다.
4. 순수 상수/타입/유틸리티를 파일 상단의 대형 단일 블록에서 모듈 단위로 이동한다.
5. 이후 채팅 화면 수정 시 한 파일 7천 줄 이상을 열지 않아도 되도록 만든다.

## 비목표

이번 작업에서 하지 않는 일은 아래와 같다.

- API 계약 변경
- UI/스타일 재디자인
- 런타임 이벤트 모델 변경
- 채팅 기능 추가
- 채팅 화면 외 unrelated 화면 구조 개편

---

## 현재 구조 문제

### `ChatInterface.tsx`

현재 `ChatInterface.tsx`는 아래 책임을 동시에 가진다.

- 세션/채팅 선택과 URL 동기화
- 런타임 상태 계산과 제출/중단 상태 관리
- 타임라인 렌더링과 메시지 카드 렌더링
- 채팅 사이드바 그룹핑, 읽음 처리, 액션 메뉴, rename/delete/pin
- 컴포저 입력, 컨텍스트 아이템, 이미지 업로드, 모델 선택
- 워크스페이스 브라우저와 파일 탐색 모달
- 모바일/데스크톱 레이아웃 제어
- 커스터마이징 사이드바 open/pin 상태
- 워크스페이스 패널과 pager 연결

문제는 “렌더링 트리”와 “상태 전이”가 한 파일에 섞여 있어서, 작은 수정도 큰 회귀 위험으로 이어진다는 점이다.

### `CustomizationSidebar.tsx`

현재 `CustomizationSidebar.tsx`도 아래 책임이 한 파일에 결합되어 있다.

- surface 전환 (`customization`, `files`, `git`)
- instruction/skill overview 로딩과 편집
- 파일 트리 탐색, 검색, 열기, 저장, 생성, 이름 변경, 삭제
- Git overview/diff/stage/unstage/commit/fetch/pull/push
- 모달 열기/닫기 및 임시 복사 상태

즉, 우측 패널 역시 “상단 네비게이션”, “데이터 로딩”, “에디터 상태”, “Git 조작”, “모달 상태”가 혼합돼 있다.

---

## 선택한 방향

채택한 방향은 “오케스트레이터 1개 + 화면 섹션 컴포넌트 + 도메인 훅” 구조다.

핵심 원칙은 아래와 같다.

1. 레이아웃 경계와 상태 경계를 분리한다.
2. 화면 섹션은 가능하면 props 기반의 표시 컴포넌트가 되게 한다.
3. 큰 상태 묶음은 “어디에 보이느냐”가 아니라 “왜 함께 변하느냐” 기준으로 묶는다.
4. 1차 목표는 완전한 abstraction보다 대형 파일 해체와 변경 안전성 확보다.
5. props drilling이 일부 늘어도 허용하되, 책임 혼합은 줄인다.

---

## 목표 구조

### 최상위 엔트리

`services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- 역할: 얇은 오케스트레이터
- 책임:
  - 서버 props 수신
  - 상위 훅 호출
  - 좌/중/우 섹션 조립
  - 공통 cross-section 이벤트 연결

이 파일은 최종적으로 “무엇을 어디에 렌더링할지”만 읽히는 상태를 목표로 한다.

### 신규 디렉터리 구조

```text
services/aris-web/app/sessions/[sessionId]/
  chat-screen/
    constants.ts
    types.ts
    utils/
    hooks/
      useChatScreenState.ts
      useChatRuntimeUi.ts
      useChatSidebarState.ts
      useComposerState.ts
      useWorkspaceBrowserState.ts
      useChatLayoutState.ts
    left-sidebar/
      ChatSidebarPane.tsx
      ChatSidebarSection.tsx
      ChatSidebarItem.tsx
      ChatSidebarActionMenu.tsx
    center-pane/
      ChatCenterPane.tsx
      ChatHeader.tsx
      ChatTimeline.tsx
      ChatTimelineItem.tsx
      ChatComposer.tsx
      FileBrowserModal.tsx
    center-pane/renderers/
      MarkdownContent.tsx
      TextReply.tsx
      LinkPreviewCarousel.tsx
      ActionEventCard.tsx
      CodeChangesEventCard.tsx
      DebugReply.tsx
      ResourceChip.tsx
    right-pane/
      RightPaneLayout.tsx
      WorkspacePanelsPane.tsx
      CustomizationSidebarContainer.tsx
    customization-sidebar/
      hooks/
      sections/
      git/
      files/
      customization/
      modals/
```

실제 파일명은 구현 중 조정될 수 있지만, 책임 경계는 위 구조를 유지한다.

---

## 상태 분리 기준

상태는 화면 위치가 아니라 “같이 변하는 이유” 기준으로 자른다.

### 1. `useChatScreenState`

역할:

- 선택된 채팅/홈/새 채팅 placeholder 상태
- URL query `chat` 동기화
- 상위 화면 전환
- 좌우 패널 기본 open/close 연결

제외:

- 사이드바 그룹핑
- 컴포저 입력 상세 상태
- 워크스페이스 파일 브라우저 상태

### 2. `useChatRuntimeUi`

역할:

- `chatRuntimeUiByChat`
- submit/abort/awaiting/disconnect/error 상태
- 마지막 제출 payload
- 채팅별 실행 UI 상태 계산

이 훅은 런타임과 제출 상태의 단일 소유자가 된다.

### 3. `useChatSidebarState`

역할:

- 채팅 정렬과 섹션 그룹핑
- snapshot/read marker/approval feedback
- 채팅 액션 메뉴 위치와 상태
- rename/delete/pin 관련 UI 상태
- sidebar에서 보이는 running/completed/history 계산

이 훅은 “채팅 리스트 화면에 필요한 파생 상태”를 한곳에 모은다.

### 4. `useComposerState`

역할:

- prompt
- context items
- plus menu
- image upload
- 모델 선택
- Gemini mode
- reasoning effort
- command menu

이 훅은 컴포저 주변 상호작용을 모두 소유한다.

### 5. `useWorkspaceBrowserState`

역할:

- 파일 브라우저 경로
- 디렉터리 로딩
- 파일 검색
- 최근 첨부
- sidebar file request

이 훅은 좌/중/우 패널 어디서 파일을 열더라도 공유 가능한 워크스페이스 탐색 상태를 만든다.

### 6. `useChatLayoutState`

역할:

- 모바일 레이아웃 여부
- viewport width
- customization overlay/pinned 계산
- center header width
- composer dock metric 관련 상태

이 훅은 반응형 레이아웃과 DOM 기반 측정 상태를 분리한다.

### 7. `CustomizationSidebar` 하위 훅

우측 패널은 별도 하위 구조로 다시 분해한다.

- `useCustomizationOverviewState`
- `useCustomizationFilesState`
- `useCustomizationGitState`
- `useCustomizationModalState`

이렇게 나누면 우측 패널 변경이 중앙 채팅 로직과 섞이지 않는다.

---

## 화면 경계

### Left Sidebar

좌측 사이드바는 아래만 담당한다.

- 채팅 목록과 섹션 헤더 렌더링
- 채팅 선택
- 채팅 액션 메뉴
- 승인/읽음/상태 배지 표시

금지:

- 직접 fetch 기반 부수효과 수행
- 타임라인 계산
- 컴포저 상태 조작

### Center Pane

중앙 패널은 아래만 담당한다.

- 상단 헤더
- 이벤트 타임라인
- permission 점프/notice
- 컴포저
- 파일 브라우저 모달

타임라인 카드와 markdown/link preview/action event renderer는 `center-pane/renderers`로 분리한다.

### Right Pane

우측 패널은 아래만 담당한다.

- workspace pager
- workspace page renderer
- customization sidebar container

`CustomizationSidebar`는 직접 상위 채팅 상태를 계산하지 않고, 필요한 값만 props 또는 훅 결과로 받는다.

---

## 리팩토링 단계

### 단계 1. 표시 컴포넌트 분리

먼저 `ChatInterface.tsx` 내부의 비교적 순수한 렌더링 덩어리를 분리한다.

우선 대상:

- resource chip / markdown / text reply / link preview
- action event / code changes / debug reply
- sidebar section / sidebar item / sidebar action menu
- center header / timeline / composer view
- file browser modal

이 단계의 목표는 7천 줄 단일 파일을 더 작은 컴포넌트 파일들로 해체하는 것이다.

### 단계 2. 상태 훅 분리

표시 컴포넌트가 나뉜 뒤, 상태와 effect를 커스텀 훅으로 이동한다.

우선 순서:

1. `useChatRuntimeUi`
2. `useChatSidebarState`
3. `useComposerState`
4. `useWorkspaceBrowserState`
5. `useChatLayoutState`
6. `useChatScreenState`

`useChatScreenState`를 마지막에 두는 이유는 여러 하위 훅을 조립하는 경계가 되기 때문이다.

### 단계 3. Right Pane 재구성

마지막으로 `CustomizationSidebar.tsx`를 우측 패널 전용 구조로 정리한다.

우선 대상:

- overview/customization surface
- files surface
- git surface
- modal layer

이 단계가 끝나면 `CustomizationSidebar.tsx`는 container 또는 index 수준으로 줄어드는 것이 목표다.

---

## 데이터 흐름 원칙

### 상향식 이벤트, 하향식 데이터

- 상태 훅이 데이터와 handler를 가진다.
- 표시 컴포넌트는 props를 받아 렌더링한다.
- 사용자 액션은 handler callback으로 상위 훅에 전달한다.

### 선택 채팅 기준 단일화

현재도 `activeChatIdResolved`를 중심으로 많은 계산이 이뤄진다. 리팩토링 후에도 선택 채팅 기준은 하나만 유지한다.

- 선택 채팅 id
- 선택 채팅 런타임 UI
- 선택 채팅 이벤트
- 선택 채팅 permission timeline

이 기준을 여러 파일에서 독립적으로 계산하지 않도록 한다.

### 레이아웃 측정과 DOM ref 분리

`scrollRef`, `centerHeaderRef`, `composerDockRef` 같은 DOM ref 의존 로직은 `useChatLayoutState` 또는 기존 전용 훅에 유지하고, 표시 컴포넌트는 ref 연결만 담당한다.

---

## 파일 이동 원칙

### `constants.ts`

이동 대상:

- layout width 상수
- debounce/timeout 상수
- section label 상수
- agent quick start
- model effort options

### `types.ts`

이동 대상:

- `AgentMeta`
- `StreamRenderItem`
- `TimelineRenderItem`
- `ContextItem`
- `ChatRuntimeUiState`
- `ChatSidebarSnapshot`
- 관련 union/type alias

### `utils/`

이동 대상:

- clipboard fallback
- path normalize/join
- formatting helpers
- agent/model normalizer
- resource label classifier

원칙:

- 순수 함수만 이동한다.
- DOM ref/state에 의존하는 함수는 훅 또는 컴포넌트 내부에 둔다.

---

## `CustomizationSidebar` 목표 구조

### container

`CustomizationSidebarContainer.tsx`

- props 수신
- 우측 패널 공통 레이아웃 조립
- 하위 hooks/sections 연결

### sections

- `CustomizationOverviewSection`
- `CustomizationFilesSection`
- `CustomizationGitSection`
- `CustomizationTerminalPlaceholder`

### files domain

- 파일 트리 렌더러
- 파일 검색 바
- 파일 에디터 wrapper
- 파일 action dialog

### git domain

- Git 상태 요약
- Working/Staged tree
- Diff viewer
- Commit / sync action bar

이 구조의 목표는 우측 패널 surface별 변경이 서로 영향을 덜 주게 만드는 것이다.

---

## 테스트 전략

리팩토링은 동작 보존이 목적이므로 테스트는 회귀 방지에 초점을 둔다.

### 최소 실행

- `npm test -- --runInBand` 또는 해당 프로젝트의 vitest 실행
- `npm run lint`

### 채팅 관련 회귀

- 기존 chat 단위 테스트 전체
- 특히 아래 테스트는 리팩토링 후 반드시 유지
  - `tests/chatComposer.test.ts`
  - `tests/chatTimeline.test.ts`
  - `tests/chatSidebarRoute.test.ts`
  - `tests/chatSidebarReadMarker.test.ts`
  - `tests/chatScroll.test.ts`

### 모바일 overflow 회귀

프로젝트 규칙상 모바일 UI 또는 긴 텍스트 관련 수정이므로 아래 두 테스트를 반드시 실행한다.

- `services/aris-web/tests/mobileOverflowLayout.test.ts`
- `services/aris-web/tests/e2e/mobile-overflow.spec.ts`

### 추가가 필요한 테스트 후보

- `ChatSidebarPane` 분리 후 섹션 렌더링 단위 테스트
- `useComposerState` 분리 후 상태 전이 단위 테스트
- `CustomizationSidebar` files/git surface 분리 후 탭 전환 및 dirty state 테스트

---

## 위험 요소

### 1. Props drilling 증가

초기 분리 단계에서는 props가 다소 길어질 수 있다. 이건 허용 가능한 비용이다.

대응:

- handler와 derived state를 도메인별 객체로 묶어 전달
- 완전 분리 후 필요한 경우에만 context 도입 검토

### 2. effect dependency 누락

거대한 파일에서 훅으로 effect를 이동할 때 의존성 누락이 생기기 쉽다.

대응:

- 이동 전후로 타입/린트 검증
- 각 훅 내부에서 “소유 상태”와 “외부 입력”을 명확히 구분

### 3. 모바일 레이아웃 회귀

좌/우 패널 분리 과정에서 overflow나 width 계산 회귀가 나올 수 있다.

대응:

- 긴 텍스트 체인에 `min-width: 0`, `max-width: 100%` 유지
- 모바일 overflow 테스트 필수 실행

### 4. 우측 패널과 중앙 패널 간 암묵적 결합

현재 `CustomizationSidebar`와 채팅 화면 사이에는 파일 열기/패널 pin/open 같은 결합이 있다.

대응:

- shared contract를 명시적인 props 타입으로 정의
- 오른쪽 패널과 중앙 패널 사이 이벤트를 container 경계에서만 연결

---

## 완료 기준

아래 조건을 만족하면 이번 리팩토링을 완료로 본다.

1. `ChatInterface.tsx`가 상위 조립 파일로 축소되어 주요 섹션이 별도 파일로 분리된다.
2. `CustomizationSidebar.tsx`가 surface별 구조 또는 container 중심 구조로 축소된다.
3. 채팅 화면 핵심 상태가 도메인 훅들로 분리된다.
4. 기존 사용자 동작이 유지된다.
5. lint/test/mobile overflow 검증을 통과한다.

---

## 권장 구현 순서

1. `chat-screen/constants.ts`, `chat-screen/types.ts`, 순수 util 추출
2. 타임라인 렌더러와 resource/link preview 분리
3. sidebar view 분리
4. composer view + file browser modal 분리
5. `useChatRuntimeUi`, `useChatSidebarState`, `useComposerState` 추출
6. `useWorkspaceBrowserState`, `useChatLayoutState`, `useChatScreenState` 추출
7. `CustomizationSidebar`를 files/git/customization 영역으로 분리
8. 최종 lint/test/mobile overflow 검증

이 순서는 큰 화면 회귀 없이 단계를 밟아 갈 수 있는 가장 안전한 경로다.
