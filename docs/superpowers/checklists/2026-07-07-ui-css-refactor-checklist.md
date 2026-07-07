# ui.css 영역별 리팩토링 체크리스트

## 작업 의도

`services/aris-web/app/styles/ui.css`를 시각 결과 변경 없이 화면 영역별 CSS 파일로 나눈다. 완료 기준은 이 체크리스트의 모든 항목을 닫고, 정적 검증과 브라우저 visual QA evidence를 남긴 뒤 커밋/푸쉬하는 것이다.

## RPI Research / FAR

- [x] 대상 파일 확인: `services/aris-web/app/styles/ui.css`는 7,648줄이다.
- [x] import 기준 확인: `services/aris-web/app/globals.css`는 현재 `tokens.css`, `reset.css`, `ui.css`, 나머지 스타일 순서로 로드한다.
- [x] 디자인 토큰 기준 확인: 별도 `DESIGN.md`는 없고 `services/aris-web/app/styles/tokens.css`가 색상, spacing, typography 토큰 기준이다.
- [x] 테스트 의존 확인: `designSystemV1Implementation`, `designSystemV3Implementation`, `projectLayoutProviderLogos`, `projectListSurface`, `parallelChatDragSurface`, `mobileOverflowLayout`가 `ui.css`를 직접 읽는다.
- [x] cascade 위험 확인: 7,222줄 이후 responsive/media 블록이 home, project, project chat, files를 함께 덮으므로 별도 responsive 파일로 기존 순서를 보존해야 한다.
- [x] FAR: 사실성, 관련성, 충분성을 통과했다. 실제 파일 경계와 테스트 의존을 확인했고, 작업은 CSS 이동과 테스트 reader 갱신으로 제한한다.

## Plan / FACTS

- [x] 전용 worktree `.worktrees/refactor-ui-css`에서만 수정한다.
- [x] 공유 `node_modules` 심볼릭 링크를 확인한다.
- [x] `ui.css`에는 base controls와 공용 primitive만 남긴다.
- [x] `ia-shell.css`에 `app-shell-ia`, `aris-ia-shell`, `m-*`, sidebar/topbar/context menu 스타일을 이동한다.
- [x] `home.css`에 `home-*`, `ask-*`, `cmd-console`, home ambient layer 스타일을 이동한다.
- [x] `project.css`에 `proj-*`, `pc-chat-directory`, project settings modal 스타일을 이동한다.
- [x] `project-chat.css`에 `pc-proto`, `pc-parallel`, chat timeline, composer, workspace, command badge 스타일을 이동한다.
- [x] `files.css`에 `files-*` 스타일을 이동한다.
- [x] `ui-responsive.css`에 기존 후반부 media/keyframes responsive 블록을 순서 보존용으로 이동한다.
- [x] `globals.css` import 순서는 기존 `ui.css` 내부 등장 순서와 동일하게 둔다.
- [x] CSS 직접 읽기 테스트는 개별 파일이 아니라 app global style 묶음을 읽도록 helper를 둔다.
- [x] FACTS: 실행 가능하고, 원자적이며, 완료 기준이 검증 가능하고, 테스트/visual QA까지 포함한다.

## 구현 체크리스트

- [x] CSS 파일 분리 후 selector 값 변경이 없는지 diff를 검토한다.
- [x] `ui.css`가 2,000줄 이하로 줄어든다.
- [x] `git diff --check`를 통과한다.
- [x] 관련 Vitest를 통과한다.
- [x] lint를 통과한다.
- [x] dev hot reload 서버를 열고 dev proxy URL을 확인한다.
- [x] 390px, 768px, 1280px 브라우저 visual QA evidence를 `.superloopy/evidence/frontend/` 아래에 남긴다.
- [x] production 배포는 하지 않는다.
- [x] 변경사항을 커밋한다.
- [x] 브랜치를 원격에 푸쉬한다.
