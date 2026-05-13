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
  renderWorkspacePage?: (item: Extract<WorkspacePagerItem, { kind: 'workspace' }>) => ReactNode;
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
  renderWorkspacePage,
  renderPanelPage,
}: WorkspacePagerShellProps) {
  if (!isMobileLayout) {
    const activeItem = workspacePagerItems.find((item) => item.id === activeWorkspacePageId);
    const workspaceItem = workspacePagerItems.find(
      (item): item is Extract<WorkspacePagerItem, { kind: 'workspace' }> => item.kind === 'workspace',
    );

    const renderWorkspaceSidecar = () => {
      if (activeItem?.kind === 'panel') {
        return renderPanelPage(activeItem);
      }
      if (activeItem?.kind === 'create-panel') {
        return renderCreatePage();
      }
      if (workspaceItem && renderWorkspacePage) {
        return renderWorkspacePage(workspaceItem);
      }
      return renderCreatePage();
    };

    return (
      <main className={styles.centerPanel} ref={centerPanelRef}>
        <div className={`${styles.centerPanelChat} ${styles.csMain}`}>
          {renderChatPage()}
        </div>
        <aside className={`${styles.centerPanelWorkspace} ${styles.wsPane}`} aria-label="Workspace">
          {renderWorkspaceSidecar()}
        </aside>
      </main>
    );
  }

  return (
    <main className={`${styles.centerPanel} ${isMobileLayout ? styles.centerPanelMobileScroll : ''}`} ref={centerPanelRef}>
      <WorkspacePager
        items={workspacePagerItems}
        activePageId={activeWorkspacePageId}
        onActivePageChange={setActiveWorkspacePageId}
        renderChatPage={renderChatPage}
        renderCreatePage={renderCreatePage}
        renderWorkspacePage={renderWorkspacePage}
        renderPanelPage={renderPanelPage}
      />
    </main>
  );
}
