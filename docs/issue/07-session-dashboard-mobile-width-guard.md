# SessionDashboard Mobile Width Guard

## 문제

모바일 랜딩 페이지(`/`)의 워크스페이스 목록 화면에서 긴 `최근 완료` 채팅 제목이 들어오면
카드와 레이아웃 전체가 우측으로 확장되며, 좌우 거터가 사라지거나 가로 오버플로우가 재발할 수 있었다.

## 구조적 원인

문제는 두 겹이었다.

1. 전역 레이아웃 충돌
- `.main`이 `padding: 1.5rem 0`을 사용하면서 `.container`의 가로 패딩을 덮어썼다.
- 결과적으로 랜딩 페이지의 기본 좌우 거터가 실제 DOM 계산에서는 `0px`이 되었다.

2. 최근 완료 목록의 폭 제약 누락
- `SessionDashboard`의 `최근 완료` 목록은
  `sessionSidebarCard -> sessionStatusLists -> sessionMiniList -> sessionMiniItem -> sessionMiniTextGroup -> sessionMiniName`
  체인으로 렌더링된다.
- 이 체인 중 일부가 `width: 100%`, `max-width: 100%`, `min-width: 0` 제약을 명시하지 않아
  긴 제목이 들어왔을 때 flex 항목이 `max-content` 쪽으로 커지며 카드 폭을 밀어냈다.
- CSS ellipsis가 선언돼 있어도, 부모 폭 체인이 닫혀 있지 않으면 카드 자체가 넓어질 수 있다.

## 해결

### 1. 전역 거터 복원
- `services/aris-web/app/styles/fab.css`
- `.main { padding: 1.5rem 0; }`를 `padding-block: 1.5rem;`로 변경
- 데스크톱도 동일하게 `padding-block: 2rem;`으로 변경

### 2. 최근 완료 목록 폭 체인 고정
- `services/aris-web/app/SessionDashboard.module.css`
- 다음 요소들에 폭 제약을 명시
  - `.sessionSidebarCard`
  - `.sessionStatusLists`
  - `.sessionMiniList`
  - `.sessionMiniItem`
  - `.sessionMiniTextGroup`
  - `.sessionMiniName`

적용 규칙:
- `width: 100%`
- `max-width: 100%`
- `min-width: 0`
- 필요한 곳에 `overflow: hidden`

## 결론

`최근 완료` 제목은 이제 문자 수 기준 하드 truncate 없이도, 폭 기반 CSS ellipsis만으로 안전하게 동작한다.
단, 이 결론은 위 폭 체인 제약이 유지된다는 전제가 있어야만 성립한다.

## 재발 방지 규칙

- `.container`를 쓰는 화면에서는 상위 레이아웃 클래스가 shorthand `padding`으로 가로 패딩을 덮어쓰지 않도록 한다.
- 긴 텍스트가 들어가는 flex/grid 체인은 텍스트 노드 하나만이 아니라 부모 체인 전체에 `min-width: 0` / `max-width: 100%`를 준다.
- `text-overflow: ellipsis`는 최종 텍스트 노드에만 선언하면 충분하지 않다. 부모의 폭 체인이 닫혀 있어야 한다.
- 모바일 레이아웃 수정 후에는 반드시 아래 두 검증을 실행한다.
  - `npm test -- tests/mobileOverflowLayout.test.ts`
  - `npx playwright test tests/e2e/mobile-overflow.spec.ts --config=playwright.config.ts`

## 검증 메모

- 로컬 Playwright 모바일 `chromium` / `webkit`에서 `/` 랜딩 페이지와 세션 화면 모두 통과
- 랜딩 페이지는 모바일 viewport 390px 기준 `dashboardLayout`과 첫 카드가 좌우 `12px` 거터를 유지해야 한다
