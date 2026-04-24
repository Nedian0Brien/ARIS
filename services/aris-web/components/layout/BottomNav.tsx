'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FolderTree, Home, MessageSquareText, PanelsTopLeft } from 'lucide-react';
import { primeAutoHideScrollState, reduceAutoHideScrollState } from './mobileScrollAutoHide';
import { useSessionScrollOrchestrator } from '@/app/sessions/[sessionId]/useSessionScrollOrchestrator';

export type TabType = 'home' | 'ask' | 'project' | 'files';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const AUTO_HIDE_RESUME_GUARD_MS = 240;
const BOTTOM_NAV_AUTO_HIDE_THRESHOLDS = {
  nearTopThreshold: 32,
  hideAfterScrollY: 72,
  hideDeltaThreshold: 8,
  revealDeltaThreshold: 8,
} as const;

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const [hidden, setHidden] = useState(false);
  const { isActive: isSessionScrollActive, phase: sessionScrollPhase } = useSessionScrollOrchestrator();
  const lastScrollY = useRef(0);
  const hiddenRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>({});
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, x: 0, ready: false });

  useEffect(() => {
    const getScrollY = () =>
      Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);

    const updateHidden = (nextHidden: boolean) => {
      if (hiddenRef.current === nextHidden) return;
      hiddenRef.current = nextHidden;
      setHidden(nextHidden);
    };

    let autoHideState = primeAutoHideScrollState({
      currentY: getScrollY(),
      now: Date.now(),
      resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
    });
    lastScrollY.current = autoHideState.lastScrollY;
    updateHidden(autoHideState.hidden);

    const updateVisibility = () => {
      autoHideState = reduceAutoHideScrollState({
        state: autoHideState,
        currentY: getScrollY(),
        now: Date.now(),
        isMobile: window.innerWidth < 768,
        thresholds: BOTTOM_NAV_AUTO_HIDE_THRESHOLDS,
        isSessionScrollActive,
        sessionScrollPhase,
      });
      lastScrollY.current = autoHideState.lastScrollY;
      updateHidden(autoHideState.hidden);
      scrollRafRef.current = null;
    };

    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(updateVisibility);
    };

    const onResize = () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      autoHideState = {
        ...autoHideState,
        hidden: window.innerWidth < 768 ? autoHideState.hidden : false,
        lastScrollY: getScrollY(),
        resumeGuardUntil: 0,
      };
      lastScrollY.current = autoHideState.lastScrollY;
      updateHidden(autoHideState.hidden);
    };

    const onResume = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      autoHideState = primeAutoHideScrollState({
        currentY: getScrollY(),
        now: Date.now(),
        resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
      });
      lastScrollY.current = autoHideState.lastScrollY;
      updateHidden(autoHideState.hidden);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [activeTab, isSessionScrollActive, sessionScrollPhase]);

  const syncIndicator = useCallback(() => {
    const nav = navRef.current;
    const activeButton = tabRefs.current[activeTab];
    if (!nav || !activeButton) return;

    const navRect = nav.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const width = Math.round(buttonRect.width);
    const x = Math.round(buttonRect.left - navRect.left - 4);

    setIndicatorStyle((prev) => {
      if (prev.ready && prev.width === width && prev.x === x) {
        return prev;
      }
      return { width, x, ready: true };
    });
  }, [activeTab]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(syncIndicator);

    const handleViewportChange = () => {
      window.requestAnimationFrame(syncIndicator);
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, [syncIndicator]);

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'ask', label: 'Ask', icon: MessageSquareText },
    { id: 'project', label: 'Project', icon: PanelsTopLeft },
    { id: 'files', label: 'Files', icon: FolderTree },
  ];

  return (
    <nav className={`bottom-nav${hidden ? ' bottom-nav-hidden' : ''}`} ref={navRef}>
      <span
        className="bottom-nav-indicator"
        aria-hidden="true"
        style={{
          width: `${indicatorStyle.width}px`,
          transform: `translateX(${indicatorStyle.x}px)`,
          opacity: indicatorStyle.ready ? 1 : 0,
        }}
      />
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            ref={(element) => {
              tabRefs.current[tab.id as TabType] = element;
            }}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id as TabType)}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
