'use client';

import React from 'react';
import { CustomizationSidebarContainer } from './CustomizationSidebarContainer';
import styles from '../../ChatInterface.module.css';
import type { SidebarFileRequest } from '../types';

type RightPaneLayoutProps = {
  sessionId: string;
  projectName: string;
  normalizedWorkspaceRootPath: string;
  isMobileLayout: boolean;
  isCustomizationOverlayLayout: boolean;
  isCustomizationSidebarOpen: boolean;
  isCustomizationPinned: boolean;
  sidebarFileRequest: SidebarFileRequest | null;
  onToggleCustomizationPinned: () => void;
  onCloseCustomizationSidebar: () => void;
};

export function RightPaneLayout({
  sessionId,
  projectName,
  normalizedWorkspaceRootPath,
  isMobileLayout,
  isCustomizationOverlayLayout,
  isCustomizationSidebarOpen,
  isCustomizationPinned,
  sidebarFileRequest,
  onToggleCustomizationPinned,
  onCloseCustomizationSidebar,
}: RightPaneLayoutProps) {
  return (
    <>
      {isCustomizationOverlayLayout && (
        <>
          {isCustomizationSidebarOpen && (
            <button
              type="button"
              className={styles.customizationBackdrop}
              onClick={onCloseCustomizationSidebar}
              aria-label="Customization 패널 닫기"
            />
          )}
          <aside
            className={`${styles.customizationDrawer} ${
              isCustomizationSidebarOpen ? styles.customizationDrawerOpen : styles.customizationDrawerClosed
            }`}
            aria-hidden={!isCustomizationSidebarOpen}
          >
            <CustomizationSidebarContainer
              sessionId={sessionId}
              projectName={projectName}
              workspaceRootPath={normalizedWorkspaceRootPath}
              requestedFile={isCustomizationOverlayLayout ? sidebarFileRequest : null}
              isPinned={isCustomizationPinned}
              onTogglePinned={onToggleCustomizationPinned}
              mode={isMobileLayout ? 'mobile' : 'desktop'}
              onRequestClose={onCloseCustomizationSidebar}
            />
          </aside>
        </>
      )}

      <aside className={styles.rightPanel}>
        <CustomizationSidebarContainer
          sessionId={sessionId}
          projectName={projectName}
          workspaceRootPath={normalizedWorkspaceRootPath}
          requestedFile={isCustomizationOverlayLayout ? null : sidebarFileRequest}
          isPinned={isCustomizationPinned}
          onTogglePinned={onToggleCustomizationPinned}
          mode="desktop"
        />
      </aside>
    </>
  );
}
