# Plan: ui.css 영역별 리팩토링

## 목표

`services/aris-web/app/styles/ui.css`를 시각 결과 변경 없이 화면 영역별 CSS 파일로 분리한다. 기존 selector 값과 cascade 순서를 유지하고, 테스트와 visual QA evidence로 회귀가 없음을 확인한다.

## 기준선

- 기존 `ui.css`: 7,648줄
- 토큰 기준: `services/aris-web/app/styles/tokens.css`
- import 기준: `services/aris-web/app/globals.css`
- 직접 CSS reader 테스트:
  - `tests/designSystemV1Implementation.test.ts`
  - `tests/designSystemV3Implementation.test.ts`
  - `tests/projectLayoutProviderLogos.test.ts`
  - `tests/projectListSurface.test.ts`
  - `tests/parallelChatDragSurface.test.ts`
  - `tests/mobileOverflowLayout.test.ts`

## 분리 계획

1. `ui.css`에는 base controls와 공용 primitive만 남긴다.
2. `ia-shell.css`에는 IA shell, sidebar, topbar, context menu 스타일을 둔다.
3. `home.css`에는 home, ask, command console, ambient layer 스타일을 둔다.
4. `project.css`에는 project list/detail, chat directory, settings modal 스타일을 둔다.
5. `project-chat.css`에는 `pc-proto`, timeline, composer, workspace, command/action 스타일을 둔다.
6. `files.css`에는 files surface 스타일을 둔다.
7. `ui-responsive.css`에는 기존 후반 responsive/keyframes 블록을 순서 보존용으로 둔다.
8. 테스트는 `ui.css` 단일 파일 대신 app global style 묶음을 읽는 helper로 갱신한다.

## 검증 계획

- `git diff --check`
- 관련 Vitest:
  - `tests/projectListSurface.test.ts`
  - `tests/parallelChatDragSurface.test.ts`
  - `tests/mobileOverflowLayout.test.ts`
  - `tests/designSystemV3Implementation.test.ts`
  - `tests/projectLayoutProviderLogos.test.ts`
  - `tests/designSystemV1Implementation.test.ts`
- `npm --prefix services/aris-web run lint`
- dev proxy visual QA:
  - `https://lawdigest.cloud/proxy/2234/`
  - 390px, 768px, 1280px
  - home, project, files, active project chat
  - evidence: `.superloopy/evidence/frontend/2026-07-07-ui-css-refactor/`

## 제외 범위

- production 배포
- 새 디자인, 새 토큰, raw color 정리
- CSS module 전환
- 기존 lint warning 정리
- 기존 dev proxy 모바일 E2E 로그인 harness 수정
