# Project Chat Redesign - Next Implementation Candidates

_Last updated: 2026-05-01_

## 기준 화면

- URL: `https://lawdigest.cloud/proxy/3309/?tab=project&project=04db3464-26cf-44ac-8b34-36037a30d5f3&view=chat&chat=cmocabpyo0007n04uieuzct8a`
- 현재 작업 브랜치: `codex/chat-prototype-fidelity-fix-20260429`
- 기준 컴포넌트: `services/aris-web/app/HomePageClient.tsx` 의 `ProjectChatSurface`
- 기준 스타일: `services/aris-web/app/styles/ui.css` 의 `.pc-proto`
- 원본 디자인 참조: `design/chat-prototype.html`, `design/chat-screen-v1.html`, `design/chat-composer-v2.html`, `design/chat-redesign-spec.md`

## 현재 판단

프로젝트 채팅 화면은 프로토타입의 큰 구조를 이미 갖추기 시작했다. Composer mode, model selector, workspace tabs, chat history, preview dock/overlay 같은 핵심 표면은 존재한다.

다만 아직 상당수 요소가 "보이는 상태"에 머물러 있다. `workspaceFiles`, `terminalSnippets`, `contextItems`, context usage 수치, preview canvas 등은 실제 프로젝트/런타임 상태와 충분히 연결되지 않았다. 다음 단계는 새 장식을 추가하는 것보다 이미 보이는 표면을 실제 데이터, 키보드 동작, 모바일 동작, 접근성 상태와 연결하는 것이다.

## 추천 1차 묶음

### 1. Composer를 진짜 입력 도구로 완성

**목표**

사용자가 가장 자주 만지는 하단 composer를 실제 작업 도구 수준으로 끌어올린다.

**후보 작업**

- `Cmd+Enter` / `Ctrl+Enter` 전송 지원
- `Shift+Enter` 줄바꿈 보존
- 한국어 IME 조합 중 Enter 오동작 방지
- textarea auto-resize: min 52px, max 200px
- mode별 placeholder 문구 분리: Agent / Plan / Terminal
- Terminal mode에서 submit 시 `/api/runtime/sessions/[sessionId]/terminal` 호출
- Stop 버튼은 단순 submit 버튼 재활용이 아니라 실행 중 상태에 맞는 별도 액션으로 분리

**근거**

- 현재 composer state와 mode state는 이미 존재한다.
- `/api/runtime/sessions/[sessionId]/terminal/route.ts` 가 이미 terminal command 실행과 이벤트 기록을 제공한다.
- 사용자 체감이 가장 빠르며, Workspace real-data 연결보다 범위가 작다.

### 2. Timeline 상태 표현 개선

**목표**

프로젝트 채팅 타임라인이 단순 메시지 목록이 아니라 "작업 진행 로그"처럼 읽히게 한다.

**후보 작업**

- 각 메시지/이벤트에 안정적인 DOM id 부여
- Chat history jump가 실제 해당 메시지 위치로 이동하도록 연결
- tool event 상태 분리: running / success / error
- permission request 카드 추가
- system notice 렌더링 추가
- code block의 언어 badge/copy 상태 polish
- artifact chip의 hover, preview open, 파일명 overflow 처리 강화

**근거**

- 현재 이벤트 렌더링은 user / agent / tool-like / snippet / artifact 정도만 간단히 분기한다.
- 이미 `visibleEvents`, `parsed.snippets`, `parsed.files`, `eventCommand()` 데이터가 있으므로 작은 구조화만으로 체감 품질을 높일 수 있다.

### 3. Preview dock/overlay를 실제 작업 흐름에 가깝게 정리

**목표**

Preview가 시각 장식이 아니라 작업 중 산출물 확인 도구처럼 동작하게 한다.

**후보 작업**

- `Esc` 동작: overlay open이면 dock으로 축소
- `Cmd+Shift+P` / `Ctrl+Shift+P` preview open/dock 토글
- overlay open 시 `aria-hidden` / focus handling 정리
- preview dock 위치를 composer와 workspace 상태에 맞춰 안정화
- preview canvas의 하드코딩 카드 대신 실제 preview target 또는 iframe 연결 후보 검토
- close와 dock의 상태 의미 분리: close는 완전 숨김, dock은 축소 상태

**근거**

- 현재 `PreviewState = closed | open | dock` 상태 기계가 이미 있다.
- overlay와 dock DOM도 존재한다.
- 키보드와 focus 처리만 추가해도 "완성되지 않은 데모" 느낌을 크게 줄일 수 있다.

## 추천 2차 묶음

### 4. Workspace 패널을 실제 데이터로 연결

**목표**

오른쪽 Workspace를 하드코딩된 보조 패널에서 실제 프로젝트 상태 패널로 전환한다.

**후보 작업**

- Files pane: `/api/fs/list` 또는 기존 file explorer 상태와 연결
- Git 상태: `/api/runtime/sessions/[sessionId]/git?kind=overview` 연결
- Terminal pane: snippet click 시 command prompt에만 넣지 말고 terminal route 실행 후보 제공
- Context pane: `tokenLabel`, model, mode, attached files를 실제 이벤트/선택 상태와 동기화
- `workspaceFiles`, `terminalSnippets`, `contextItems`를 `ProjectChatSurface` 내부 상수에서 파생 데이터/훅으로 이동

**근거**

- 지금 Workspace는 화면상 가장 커 보이지만 데이터 신뢰도가 낮다.
- 이미 사용할 수 있는 API가 존재한다.
- 단, 범위가 커지므로 1차 묶음 후에 진행하는 편이 안전하다.

### 5. 모바일/태블릿 Workspace UX 구현

**목표**

1100px 이하에서 Workspace가 단순히 사라지지 않도록 한다.

**후보 작업**

- tablet: workspace slide-in overlay
- mobile: workspace bottom sheet
- sheet close/scrim tap
- workspace tab 전환 유지
- composer와 preview dock이 bottom sheet와 겹치지 않도록 위치 재조정
- `mobileOverflowLayout.test.ts`에 project chat surface guard 추가

**근거**

- 현재 CSS는 `@media (max-width: 1100px)`에서 `.pc-proto .shell__workspace { display: none; }` 처리한다.
- 사용자가 모바일 UI/긴 텍스트 overflow에 민감하므로 이 작업은 별도 검증이 필요하다.

## 정리/품질 후보

### 6. ProjectChatSurface 모듈 분리

**목표**

후속 작업을 계속하기 쉽도록 큰 컴포넌트를 적절히 나눈다.

**후보 모듈**

- `project-chat/ProjectChatSurface.tsx`
- `project-chat/ProjectChatTimeline.tsx`
- `project-chat/ProjectChatComposer.tsx`
- `project-chat/ProjectChatWorkspace.tsx`
- `project-chat/ProjectChatPreview.tsx`
- `project-chat/projectChatModel.ts`

**근거**

`ProjectChatSurface`가 현재 API 로딩, composer state, timeline rendering, workspace tabs, preview state를 모두 가진다. 이후 real-data 연결과 모바일 sheet를 넣으면 파일이 더 무거워진다.

### 7. 접근성/키보드 상태 보강

**후보 작업**

- `role="tablist"` 하위 버튼을 `role="tab"` / `aria-selected`로 정리
- model selector / preview overlay의 `aria-hidden` 상태 정리
- overlay focus trap 또는 최소 focus return
- tooltip id 중복 가능성 점검
- reduced motion에서 pulse/highlight animation 축소

### 8. 테스트를 문자열 확인에서 상태 확인으로 승격

**후보 작업**

- composer keyboard behavior test
- workspace tab state test
- preview state machine test
- terminal mode submit test
- mobile overflow guard에 project chat route 추가
- 필요 시 브라우저 smoke: exact proxy URL 또는 dev proxy URL에서 desktop/mobile screenshot 확인

**근거**

현재 `projectListSurface.test.ts`는 주로 `toContain` 기반이다. 리디자인이 상호작용 중심으로 바뀌면 실제 상태 전환 테스트가 필요하다.

## 권장 순서

1. Composer 입력/전송 polish
2. Timeline 상태 표현과 jump target 정리
3. Preview dock/overlay keyboard/focus polish
4. Workspace real-data 연결
5. Mobile/tablet workspace sheet
6. ProjectChatSurface 모듈 분리
7. 접근성/테스트 보강

첫 구현 단위는 1~3을 하나의 작은 리디자인 polish PR로 묶는 것을 추천한다. 중앙 채팅 경험이 먼저 좋아지고, 이후 Workspace real-data 연결을 더 안전하게 진행할 수 있다.

## 완료 기준

- project chat route가 legacy session route로 빠지지 않는다.
- composer에서 키보드 전송/줄바꿈/IME가 안정적으로 동작한다.
- Run/Files/Terminal/Context 탭이 실제 상태와 어긋나지 않는다.
- Preview open/dock/close 상태가 키보드와 버튼 모두에서 일관된다.
- 모바일에서 수평 overflow가 없다.
- `projectListSurface.test.ts`, `mobileOverflowLayout.test.ts`, `tsc --noEmit`, `next lint`가 통과한다.
