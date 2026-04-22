import { normalizeLocalPreviewConfig } from '@/lib/preview/localPreviewProxy';
import type { WorkspacePanelRecord, WorkspacePanelType } from './types';

const PANEL_TITLES: Record<WorkspacePanelType, string> = {
  preview: 'Preview',
  explorer: 'Workspace',
  terminal: 'Terminal',
  bookmark: 'Bookmark',
};

function buildDefaultConfig(type: WorkspacePanelType): Record<string, unknown> {
  if (type === 'preview') {
    return normalizeLocalPreviewConfig({ port: 3305, path: '/' });
  }

  return {};
}

export function buildDefaultWorkspacePanel(input: {
  id: string;
  type: WorkspacePanelType;
  createdAt: string;
}): WorkspacePanelRecord {
  return {
    id: input.id,
    type: input.type,
    title: PANEL_TITLES[input.type],
    config: buildDefaultConfig(input.type),
    createdAt: input.createdAt,
  };
}
