import type { WorkspacePanelLayout } from '@/lib/workspacePanels/types';

export type WorkspacePagerItem =
  | { id: 'chat'; kind: 'chat' }
  | { id: 'workspace'; kind: 'workspace' }
  | { id: 'create-panel'; kind: 'create-panel' }
  | { id: string; kind: 'panel'; panelId: string };

export function buildWorkspacePagerItems(layout: WorkspacePanelLayout): WorkspacePagerItem[] {
  void layout;
  return [
    { id: 'chat', kind: 'chat' },
    { id: 'workspace', kind: 'workspace' },
  ];
}

export function moveWorkspacePager(
  items: WorkspacePagerItem[],
  currentId: string,
  direction: 'previous' | 'next',
): string {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) {
    return items[0]?.id ?? 'chat';
  }

  if (direction === 'previous') {
    return items[Math.max(0, currentIndex - 1)]?.id ?? items[0]?.id ?? 'chat';
  }

  return items[Math.min(items.length - 1, currentIndex + 1)]?.id ?? items[items.length - 1]?.id ?? 'create-panel';
}
