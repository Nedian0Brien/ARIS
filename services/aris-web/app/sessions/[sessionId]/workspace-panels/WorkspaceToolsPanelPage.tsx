'use client';

import React from 'react';
import type { WorkspacePanelRecord } from '@/lib/workspacePanels/types';
import { CustomizationSidebar } from '../CustomizationSidebar';
import type { RequestedFilePayload } from '../customization-sidebar/types';

type WorkspaceToolsPanelPageProps = {
  sessionId: string;
  panel: WorkspacePanelRecord;
  projectName: string;
  workspaceRootPath: string;
  requestedFile: RequestedFilePayload | null;
  isMobileLayout: boolean;
  onReturnToChat?: () => void;
};

export function WorkspaceToolsPanelPage({
  sessionId,
  projectName,
  workspaceRootPath,
  requestedFile,
  isMobileLayout,
  onReturnToChat,
}: WorkspaceToolsPanelPageProps) {
  return (
    <CustomizationSidebar
      sessionId={sessionId}
      projectName={projectName}
      workspaceRootPath={workspaceRootPath}
      requestedFile={requestedFile}
      mode={isMobileLayout ? 'mobile' : 'desktop'}
      onRequestClose={onReturnToChat}
    />
  );
}
