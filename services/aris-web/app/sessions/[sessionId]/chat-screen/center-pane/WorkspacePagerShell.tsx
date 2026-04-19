'use client';

import React from 'react';
import type { ReactNode, RefObject } from 'react';
import type { WorkspacePagerItem } from '../../workspace-panels/pagerModel';
import { WorkspacePager } from '../../workspace-panels/WorkspacePager';
import styles from '../../ChatInterface.module.css';

type WorkspacePagerShellProps = {
  centerPanelRef: RefObject<HTMLElement | null>;
  isMobileLayout: boolean;
  workspacePagerItems: readonly WorkspacePagerItem[];
  activeWorkspacePageId: string;
  setActiveWorkspacePageId: (pageId: string) => void;
  renderChatPage: () => ReactNode;
  renderCreatePage: () => ReactNode;
  renderPanelPage: (item: Extract<WorkspacePagerItem, { kind: 'panel' }>) => ReactNode;
};

export function WorkspacePagerShell({
  centerPanelRef,
  isMobileLayout,
  workspacePagerItems,
  activeWorkspacePageId,
  setActiveWorkspacePageId,
  renderChatPage,
  renderCreatePage,
  renderPanelPage,
}: WorkspacePagerShellProps) {
  return (
    <main className={`${styles.centerPanel} ${isMobileLayout ? styles.centerPanelMobileScroll : ''}`} ref={centerPanelRef}>
      <WorkspacePager
        items={workspacePagerItems}
        activePageId={activeWorkspacePageId}
        onActivePageChange={setActiveWorkspacePageId}
        renderChatPage={renderChatPage}
        renderCreatePage={renderCreatePage}
        renderPanelPage={renderPanelPage}
      />
    </main>
  );
}
