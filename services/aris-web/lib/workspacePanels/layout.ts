import type { WorkspacePanelActivePage, WorkspacePanelLayout, WorkspacePanelRecord, WorkspacePanelType } from './types';

function isPanelType(value: unknown): value is WorkspacePanelType {
  return value === 'preview' || value === 'explorer' || value === 'terminal' || value === 'bookmark';
}

function normalizeActivePage(value: unknown, panels: WorkspacePanelRecord[]): WorkspacePanelActivePage {
  if (
    value
    && typeof value === 'object'
    && (value as { kind?: unknown }).kind === 'panel'
    && typeof (value as { panelId?: unknown }).panelId === 'string'
    && panels.some((panel) => panel.id === (value as { panelId: string }).panelId)
  ) {
    return {
      kind: 'panel',
      panelId: (value as { panelId: string }).panelId,
    };
  }

  return { kind: 'chat' };
}

function normalizePanel(value: unknown): WorkspacePanelRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    type?: unknown;
    title?: unknown;
    config?: unknown;
    createdAt?: unknown;
  };

  if (typeof candidate.id !== 'string' || !isPanelType(candidate.type) || typeof candidate.title !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    type: candidate.type,
    title: candidate.title,
    config: candidate.config && typeof candidate.config === 'object' ? candidate.config as Record<string, unknown> : {},
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null,
  };
}

export function normalizeWorkspacePanelLayout(input: unknown): WorkspacePanelLayout {
  const panels = Array.isArray((input as { panels?: unknown })?.panels)
    ? ((input as { panels: unknown[] }).panels.map(normalizePanel).filter(Boolean) as WorkspacePanelRecord[])
    : [];

  return {
    version: 1,
    activePage: normalizeActivePage((input as { activePage?: unknown })?.activePage, panels),
    panels,
  };
}
