'use client';

import React, { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const getScrollY = () =>
      Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);

    const updateHidden = (nextHidden: boolean) => {
      if (hiddenRef.current === nextHidden) return;
      hiddenRef.current = nextHidden;
      setHidden(nextHidden);
    };

    lastScrollY.current = getScrollY();

    const onScroll = () => {
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
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabs = [
    { id: 'sessions', label: '세션', icon: LayoutDashboard },
    { id: 'console', label: '콘솔', icon: Terminal },
    { id: 'files', label: '파일', icon: FolderTree },
    { id: 'settings', label: '설정', icon: Settings },
  ];

  return (
    <nav className={`bottom-nav${hidden ? ' bottom-nav-hidden' : ''}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id as TabType)}
          >
            <Icon size={22} />
            <span>{tab.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
