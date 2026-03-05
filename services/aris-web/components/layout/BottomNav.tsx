'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Terminal, FolderTree, Settings } from 'lucide-react';

export type TabType = 'sessions' | 'console' | 'files' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const [hidden, setHidden] = useState(false);
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

    lastScrollY.current = getScrollY();

    const updateVisibility = () => {
      const currentY = getScrollY();
      const delta = currentY - lastScrollY.current;
      const movementThreshold = 8;

      if (currentY < 32) {
        updateHidden(false);
      } else if (delta > movementThreshold && currentY > 72) {
        updateHidden(true);
      } else if (delta < -movementThreshold) {
        updateHidden(false);
      }

      lastScrollY.current = currentY;
      scrollRafRef.current = null;
    };

    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(updateVisibility);
    };

    const onResize = () => {
      if (window.innerWidth >= 768) {
        updateHidden(false);
      }
      lastScrollY.current = getScrollY();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

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
    { id: 'sessions', label: '세션', icon: LayoutDashboard },
    { id: 'console', label: '콘솔', icon: Terminal },
    { id: 'files', label: '파일', icon: FolderTree },
    { id: 'settings', label: '설정', icon: Settings },
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
