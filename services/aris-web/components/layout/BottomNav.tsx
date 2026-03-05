'use client';

import React from 'react';
import { LayoutDashboard, Terminal, FolderTree, Settings } from 'lucide-react';

export type TabType = 'sessions' | 'console' | 'files' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'sessions', label: '세션', icon: LayoutDashboard },
    { id: 'console', label: '콘솔', icon: Terminal },
    { id: 'files', label: '파일', icon: FolderTree },
    { id: 'settings', label: '설정', icon: Settings },
  ];

  return (
    <nav className="bottom-nav">
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
