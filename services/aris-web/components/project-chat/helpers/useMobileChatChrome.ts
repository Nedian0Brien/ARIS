'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const MOBILE_CHAT_CHROME_MEDIA_QUERY = '(max-width: 767px)';

const SCROLL_DELTA_TOLERANCE_PX = 6;
const TOP_REVEAL_THRESHOLD_PX = 24;
const DEFAULT_SUPPRESS_DURATION_MS = 350;

/**
 * 모바일 채팅 화면의 상단 크롬(탑바+채팅 헤더) 자동 숨김과
 * 컴포저 pill 축소 상태를 타임라인 스크롤 방향으로부터 계산한다.
 *
 * - 아래로 스크롤: 크롬 숨김 + 컴포저 축소
 * - 위로 스크롤: 크롬 표시 (컴포저는 축소 유지, 터치로만 확장)
 * - 최상단 근처: 크롬 항상 표시
 * - 프로그래매틱 스크롤(자동 하단 고정, 이전 메시지 로드 등)은
 *   suppressChromeScroll()로 표시한 시간 동안 무시한다.
 * - 컴포저 입력이 포커스된 동안에는 축소하지 않는다 (모바일 키보드
 *   오픈 시 발생하는 뷰포트 리사이즈 스크롤에 의한 오축소 방지).
 */
export function useMobileChatChrome({
  isComposerInputFocused,
}: {
  isComposerInputFocused: () => boolean;
}) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const isMobileViewportRef = useRef(false);
  const lastScrollTopRef = useRef<number | null>(null);
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_CHAT_CHROME_MEDIA_QUERY);
    const syncViewport = () => {
      isMobileViewportRef.current = media.matches;
      setIsMobileViewport(media.matches);
      if (!media.matches) {
        setIsChromeHidden(false);
        setIsComposerCollapsed(false);
      }
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  const suppressChromeScroll = useCallback((durationMs: number = DEFAULT_SUPPRESS_DURATION_MS) => {
    suppressUntilRef.current = performance.now() + durationMs;
  }, []);

  const expandComposer = useCallback(() => {
    // 확장 직후 레이아웃 변화로 발생하는 스크롤 이벤트가 곧바로
    // 재축소시키지 않도록 잠시 스크롤 판정을 멈춘다.
    suppressUntilRef.current = performance.now() + DEFAULT_SUPPRESS_DURATION_MS;
    setIsComposerCollapsed(false);
  }, []);

  const handleTimelineChromeScroll = useCallback((node: HTMLElement) => {
    if (!isMobileViewportRef.current) {
      return;
    }
    // iOS 오버스크롤 바운스 구간의 음수/초과 값은 방향 판정에서 제외한다.
    const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    const top = Math.min(Math.max(node.scrollTop, 0), maxScrollTop);

    if (performance.now() < suppressUntilRef.current) {
      lastScrollTopRef.current = top;
      return;
    }

    if (top <= TOP_REVEAL_THRESHOLD_PX) {
      lastScrollTopRef.current = top;
      setIsChromeHidden(false);
      return;
    }

    if (lastScrollTopRef.current === null) {
      lastScrollTopRef.current = top;
      return;
    }

    const delta = top - lastScrollTopRef.current;
    if (Math.abs(delta) <= SCROLL_DELTA_TOLERANCE_PX) {
      return;
    }
    lastScrollTopRef.current = top;

    setIsChromeHidden(delta > 0);
    if (!isComposerInputFocused()) {
      setIsComposerCollapsed(true);
    }
  }, [isComposerInputFocused]);

  return {
    expandComposer,
    handleTimelineChromeScroll,
    isChromeHidden,
    isComposerCollapsed,
    isMobileViewport,
    suppressChromeScroll,
  };
}
