# Chat Mobile Reload Scroll Restoration Investigation

## 문제

기존 채팅을 모바일 레이아웃에서 다시 열거나 새로고침하면,
처음에는 마지막 메시지 근처로 내려가는 것처럼 보이지만 곧 화면이 중간 지점에 고정된 채 남는다.
상황에 따라 사용자는 이 과정을 "마지막으로 갔다가 다시 위로 딸려 올라간다"로 체감한다.

## 재현 환경

- 브랜치: `codex/investigate-scroll-pullup-cause`
- 로컬 dev 서버: `http://127.0.0.1:3310`
- 재현 채팅:
  - sessionId: `af322158-6a87-4e07-aee4-37ef6eef9380`
  - chatId: `cmo2jfbkz0007mj4oj1bhqqzb`
- viewport: `390x844` mobile

## 핵심 관측

### 1. reload 직후 앱 코드보다 브라우저의 native scroll restoration이 먼저 적용된다

모바일 추적에서 새로고침 후 다음 순서가 확인됐다.

- 앱이 `window.scrollTo(...)`를 호출하기 전에 `window:scroll` 이벤트가 먼저 발생
- 그 시점의 `window.scrollY`는 `4069`
- 추적 로그에는 이 값을 만든 앱 측 `window.scrollTo` 호출이 없다

즉, 이 이동은 React/Next 코드가 아니라 브라우저의 기본 scroll restoration에서 온다.

### 2. 그 뒤 앱의 tail restore는 `window`가 아니라 내부 `stream`에만 적용된다

새로고침 후 반복적으로 호출된 스크롤 명령은 아래 패턴이었다.

- 호출 위치: `useChatTailRestore.ts`
- 실제 대상: `element.scrollTo({ top: 0 })`
- 대상 엘리먼트: `ChatInterface_stream`

문제는 모바일 레이아웃에서 실제 스크롤 컨테이너가 `window`여야 한다는 점이다.
그런데 reload 경로에서는 bottom restore가 `window.scrollTo(...)`로 이어지지 않고,
스크롤되지 않는 내부 `stream`에 0을 계속 쓰는 상태가 된다.

### 3. 그래서 "위로 딸려 올라가는" 체감이 생긴다

새로고침 직후 브라우저가 복원한 `scrollY`는 일정한 절대값으로 남아 있는데,
렌더가 진행되면서 문서 높이(`docH`)는 계속 커진다.

예시 관측:

- `reload+500ms`: `y=4069`, `docH=5030`
- `reload+3000ms`: `y=4069`, `docH=5614`
- `reload+10000ms`: `y=4069`, `docH=7250`

즉, 화면의 절대 Y값은 그대로인데 문서 하단이 계속 멀어지므로
사용자는 "아래로 갔다가 다시 위로 끌려 올라간다"고 느끼게 된다.

## 검증 실험

브라우저의 native scroll restoration만 꺼서 다시 새로고침하면
이 비정상적인 `window:scroll -> y=4069` 이벤트가 사라졌다.

- 설정: `history.scrollRestoration = 'manual'`
- 결과:
  - `after1s`: `y=0`
  - `after5s`: `y=0`
  - native restoration으로 보이는 별도 `window:scroll` 이벤트 없음

이 실험으로 최소한 "위로 끌려가는 최초 트리거"가 앱 코드가 아니라
브라우저의 자동 scroll restoration이라는 점은 확인됐다.

## 현재 시점의 구조적 원인

문제는 두 가지가 겹친다.

1. 모바일 reload에서 브라우저가 저장된 `window.scrollY`를 자동 복원한다.
2. 같은 시점에 앱의 chat tail restore가 `window`가 아니라 내부 `stream`을 대상으로 동작하거나,
   최소한 `window` 기준 bottom re-pin을 다시 확보하지 못한다.

결과적으로 브라우저가 복원한 중간 지점이 유지되고,
이후 문서 높이만 계속 커지면서 tail 기준 위치가 더 멀어진다.

## 직접 확인한 관련 코드

- `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`
  - `scrollConversationToBottom()`가 `isMobileLayout`에 따라 `window` 또는 `stream`을 선택
  - `complete()`에서도 모바일이면 `window.scrollTo(...)`로 최종 정렬
- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
  - `syncLayout()`가 `matchMedia` 결과로 `isMobileLayout`을 세팅
  - auto-scroll effect가 `scrollConversationToBottom('auto')`를 반복 호출
  - 모바일에서는 `window.scroll` 기반 `loadOlder` 트리거도 존재

## loadOlder 관련 메모

이번 재현에서는 실제 `events?before=...` 호출은 관측되지 않았고,
문제의 1차 원인은 pagination보다 scroll restoration 쪽이 더 직접적이었다.

다만 브라우저가 복원한 `scrollY`가 더 작은 값이었다면,
모바일의 `window.scroll <= 96` 조건 때문에 `loadOlderHistory()`가 이어서 발동할 가능성은 남아 있다.

## 다음 확인 포인트

1. reload 경로에서 왜 모바일 viewport인데도 `window`가 아니라 `stream` scroll 호출이 남는지 확인
2. 페이지 진입/새로고침 직후 `history.scrollRestoration = 'manual'`을 관리할지 결정
3. 모바일 tail restore 완료 전에는 브라우저가 복원한 `window.scrollY`를 무효화할 안전한 시점 정의
