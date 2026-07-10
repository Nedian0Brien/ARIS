// 키보드 열림 판정. 터치(coarse pointer) 기기에서는 "텍스트 입력이 포커스된
// 동안"을 곧 키보드 열림으로 본다(ChatGPT 웹의 data-visual-keyboard와 동일한
// 포커스-수명 모델). 기하 측정(bottomInset)이 보조로 남는 이유와 한계:
// interactive-widget=resizes-content가 적용되는 iOS/Android에서는 키보드가
// 열릴 때 layout viewport(innerHeight)까지 함께 줄어들어
// bottomInset = innerHeight - vvHeight - offsetTop ≈ 0 이 되므로, 기하
// 측정만으로는 키보드를 영원히 감지할 수 없다(실기기 실측 2026-07-10:
// innerH=399, vv h=399, top=347 → inset 0, kb=false로 오판 → 키보드 게이트
// CSS 전체 미발동). 낙관적 타이머(700ms)도 iOS 키보드 확정(+714ms)과
// 스크롤(+827ms)보다 먼저 만료되어 경주에서 진다. 포커스 수명 기반이 둘 다에
// 면역이다 — 게이트되는 CSS 규칙은 전부 라이브 측정값
// (--visual-viewport-height/offset-top) 기반이라, 하드웨어 키보드 등으로
// 실제 가상 키보드가 없으면 자연히 no-op이 된다. fine pointer(데스크톱)를
// 제외하는 이유는 --app-vh 동결이 포커스 내내 이어지면 창 크기 조절이
// 반영되지 않기 때문.
export const computeKeyboardOpen = (input: {
  bottomInset: number;
  threshold: number;
  withinOptimisticWindow: boolean;
  focusedTextInput: boolean;
  coarsePointer: boolean;
}): boolean => (input.focusedTextInput && input.coarsePointer)
  || input.bottomInset > input.threshold
  || input.withinOptimisticWindow;
