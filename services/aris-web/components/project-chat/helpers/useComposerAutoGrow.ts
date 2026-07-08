'use client';

import { type RefObject, useLayoutEffect } from 'react';

/**
 * 컴포저 textarea 높이를 입력 내용에 맞춰 갱신한다.
 * 상한은 CSS max-height가 결정하며, 초과분은 textarea 내부 스크롤로 처리된다.
 * enabled가 false(pill 축소 상태)인 동안에는 측정을 멈추고,
 * 다시 true가 되는 시점에 현재 값 기준으로 재측정한다.
 */
export function useComposerAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled: boolean = true,
) {
  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [ref, value, enabled]);
}
