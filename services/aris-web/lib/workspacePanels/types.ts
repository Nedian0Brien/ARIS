export type WorkspacePanelType = 'preview' | 'explorer' | 'terminal' | 'bookmark';

export type WorkspacePanelActivePage =
  | { kind: 'chat' }
  | { kind: 'panel'; panelId: string };

export type WorkspacePanelRecord = {
  id: string;
  type: WorkspacePanelType;
  title: string;
  config: Record<string, unknown>;
  createdAt: string | null;
};

export type WorkspacePanelLayout = {
  version: 1;
  activePage: WorkspacePanelActivePage;
  panels: WorkspacePanelRecord[];
};
