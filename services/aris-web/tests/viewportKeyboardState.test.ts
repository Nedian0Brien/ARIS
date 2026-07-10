import { describe, expect, it } from 'vitest';
import { computeKeyboardOpen } from '@/components/layout/viewportKeyboardState';

describe('computeKeyboardOpen — 포커스-수명 기반 키보드 판정', () => {
  it('네이티브 팬 중(기하 인셋 0, iOS 실측 2026-07-10)에도 포커스 중이면 키보드 열림', () => {
    // 실기기 3차 캡처: innerH=399, vv h=399, top=347
    // → bottomInset = max(0, 399 - 399 - 347) = 0.
    // 낙관적 700ms 창은 iOS 키보드 확정(+714ms)/스크롤(+827ms) 전에 만료됐다.
    // 기존 판정(inset || optimistic)은 여기서 false → 키보드 게이트 CSS 전체
    // 미발동 → 팬-추종 transform이 발동하지 못해 컴포저가 화면 밖으로 밀렸다.
    expect(
      computeKeyboardOpen({
        bottomInset: 0,
        threshold: 60,
        withinOptimisticWindow: false,
        focusedTextInput: true,
        coarsePointer: true,
      }),
    ).toBe(true);
  });

  it('데스크톱(fine pointer)에서는 포커스만으로 키보드 열림으로 보지 않는다', () => {
    // 하드웨어 키보드 환경에서 포커스-수명 모델을 적용하면 --app-vh 동결이
    // 포커스 내내 이어져 창 크기 조절이 반영되지 않는 회귀가 생긴다.
    expect(
      computeKeyboardOpen({
        bottomInset: 0,
        threshold: 120,
        withinOptimisticWindow: false,
        focusedTextInput: true,
        coarsePointer: false,
      }),
    ).toBe(false);
  });

  it('구세계(innerHeight 불변) 기하 측정은 그대로 동작한다', () => {
    // interactive-widget 미지원 브라우저: innerH=746, vv h=399 → inset 347.
    expect(
      computeKeyboardOpen({
        bottomInset: 347,
        threshold: 120,
        withinOptimisticWindow: false,
        focusedTextInput: false,
        coarsePointer: true,
      }),
    ).toBe(true);
  });

  it('포커스 직후 낙관적 창 안에서는 측정 전에도 키보드 열림', () => {
    expect(
      computeKeyboardOpen({
        bottomInset: 0,
        threshold: 60,
        withinOptimisticWindow: true,
        focusedTextInput: true,
        coarsePointer: true,
      }),
    ).toBe(true);
  });

  it('블러 후(포커스 없음, 인셋 없음)에는 키보드 닫힘', () => {
    expect(
      computeKeyboardOpen({
        bottomInset: 0,
        threshold: 120,
        withinOptimisticWindow: false,
        focusedTextInput: false,
        coarsePointer: true,
      }),
    ).toBe(false);
  });
});
