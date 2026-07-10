// 키보드 열림 판정. 터치(coarse pointer) 기기에서는 "텍스트 입력이 포커스된
// 동안"을 곧 키보드 열림으로 본다(ChatGPT 웹의 data-visual-keyboard와 동일한
// 포커스-수명 모델). 기하 측정(bottomInset)이 보조로 남는 이유와 한계:
// bottomInset = innerHeight - vvHeight - offsetTop 은 브라우저가 포커스된
// 입력을 보여주려고 visual viewport를 팬하는 순간(offsetTop 증가) 0으로
// 떨어져 "키보드 닫힘"으로 오판한다. 이 오판이 --app-vh 동결을 풀어 셸을
// 붕괴시키는 것이 "컴포저가 화면 꼭대기로 튀는" 버그의 원래 뿌리였다
// (실기기 실측 2026-07-10: vv h=399, top=347 → inset 0, kb=false).
// resizes-content류 뷰포트 축소 환경에서도 innerHeight가 함께 줄어 같은
// 방식으로 0이 된다. 낙관적 타이머(700ms)도 iOS 키보드 확정(+714ms)과
// 스크롤(+827ms)보다 먼저 만료되어 경주에서 진다. 포커스 수명 기반은 이
// 모두에 면역이다 — 이 판정이 켜 두는 것(--app-vh 동결, 컴포저 max-height
// 상한)은 실제 가상 키보드가 없으면(하드웨어 키보드 등) 자연히 no-op이라
// 오래 켜 두어도 안전하다. fine pointer(데스크톱)를 제외하는 이유는
// --app-vh 동결이 포커스 내내 이어지면 창 크기 조절이 반영되지 않기 때문.
export const computeKeyboardOpen = (input: {
  bottomInset: number;
  threshold: number;
  withinOptimisticWindow: boolean;
  focusedTextInput: boolean;
  coarsePointer: boolean;
}): boolean => (input.focusedTextInput && input.coarsePointer)
  || input.bottomInset > input.threshold
  || input.withinOptimisticWindow;
