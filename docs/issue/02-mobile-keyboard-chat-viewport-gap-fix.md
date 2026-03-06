# 이슈 리포트: iOS Safari 채팅 입력 포커스 확대 및 키보드 하단 공백

## 1. 개요
2026년 3월 6일(iOS Safari 기준) 채팅 화면에서 다음 문제가 연속으로 발생했다.

- 입력창 터치 시 화면이 확대됨
- 키보드 오픈 시 하단에 흰 여백이 생기고, 채팅 본문이 위로 밀려 가시성이 떨어짐

본 문서는 증상, 원인, 수정 이력, 재발 방지 기준을 정리한다.

## 2. 증상 및 재현 조건

### 2.1 입력창 포커스 확대
- **증상**: `textarea` 터치 시 Safari가 자동 줌 인.
- **재현 조건**:
  - iPhone Safari
  - 채팅 세션 화면(`/sessions/[sessionId]`)
  - 하단 composer 입력창 탭

### 2.2 키보드 오픈 시 하단 흰 여백 + 채팅 밀림
- **증상**:
  - 키보드 상단(화면 하단 UI 영역) 근처에 흰 공백 발생
  - 채팅 리스트가 위로 과도하게 밀려 실제 메시지 확인이 어려움
- **재현 조건**:
  - iPhone Safari
  - 채팅 화면에서 입력창 포커스 후 키보드 표시
  - safe-area + fixed composer + viewport 동기화가 동시에 작동하는 상태

## 3. 원인 분석

### 3.1 확대 이슈 원인
- 모바일 Safari의 기본 동작(입력 요소 포커스 시 확대)이 남아 있었음.
- viewport 제약이 런타임(클라이언트 effect)에서만 적용되어 초기 포커스 타이밍에 확대가 발생할 수 있었음.

### 3.2 하단 공백/채팅 밀림 원인
- `visualViewport.height`를 그대로 앱 높이(`--app-vh`)에 반영하면, 키보드 오픈 시 전체 레이아웃 높이가 함께 줄어듦.
- 동시에 composer/stream이 safe-area를 하단 오프셋으로 유지해, 키보드 상태에서 공백이 중복 반영됨.
- 결과적으로:
  - 앱 높이 축소 + 하단 오프셋 유지가 겹치며 흰 여백 생성
  - 채팅 본문이 의도보다 위로 밀려 보임

## 4. 수정 내용

### 4.1 입력 확대 방지
- 서버 렌더 시점 viewport를 고정 적용:
  - `maximumScale: 1`
  - `userScalable: false`
- 기존 iOS 전용 런타임 viewport 재작성 로직 제거

관련 파일:
- `services/aris-web/app/layout.tsx`
- `services/aris-web/components/layout/ViewportHeightSync.tsx`

### 4.2 키보드 공백/밀림 방지
- `ViewportHeightSync`에서 키보드 상태를 분리 계산:
  - `--keyboard-inset-height` 추가
  - `--app-vh`는 키보드 오픈 시에도 축소하지 않고, 세션 내 최대 viewport 높이 기준 유지
  - `--visual-viewport-height` 별도 보관
- 채팅 CSS에서 실효 safe-area를 사용:
  - `--safe-area-bottom-effective = max(0, safe-area - keyboardInset)`
  - composer bottom / stream bottom padding 계산식에 적용
- immersive shell에 `overflow: hidden` 적용해 루트 스크롤 누수 차단

관련 파일:
- `services/aris-web/components/layout/ViewportHeightSync.tsx`
- `services/aris-web/app/styles/tokens.css`
- `services/aris-web/app/styles/layout.css`
- `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`

## 5. 검증 결과
- `npm run build` (services/aris-web) 성공
- 실서비스 배포 후 iPhone Safari에서 사용자 확인으로 문제 해결 확인

## 6. 커밋 이력
- `6455fb3` fix: prevent iOS Safari zoom on chat input focus
- `857f4ad` fix: remove mobile keyboard bottom gap in chat layout
- `ffc9578` fix: stabilize chat viewport height while mobile keyboard is open

## 7. 재발 방지 대책
- 키보드 대응 시 `visualViewport.height`를 앱 전체 height에 직접 1:1 반영하지 않는다.
- 입력창/하단 도크가 `position: fixed`일 때 safe-area와 keyboard inset을 별도 변수로 관리한다.
- iOS Safari 이슈는 "초기 포커스 타이밍(SSR 이후 첫 인터랙션)" 기준으로 테스트한다.
- 모바일 UI 회귀 테스트 항목에 아래를 고정 포함한다.
  - 입력창 포커스 시 확대 여부
  - 키보드 오픈/닫힘 시 하단 공백 여부
  - 마지막 메시지 가시성/스크롤 고정 여부
