'use client';

import React from 'react';
import type { WorkspacePanelRecord } from '@/lib/workspacePanels/types';
import type { RequestedFilePayload } from '../customization-sidebar/types';
import { WorkspaceShell } from './WorkspaceShell';

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
    <WorkspaceShell
      sessionId={sessionId}
      projectName={projectName}
      workspaceRootPath={workspaceRootPath}
      requestedFile={requestedFile}
      mode={isMobileLayout ? 'mobile' : 'desktop'}
      onRequestClose={onReturnToChat}
    />
  );
}
