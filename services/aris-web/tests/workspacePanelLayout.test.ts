import { describe, expect, it } from 'vitest';

type LayoutModule = {
  normalizeWorkspacePanelLayout?: (input: unknown) => {
    version: number;
    activePage: { kind: 'chat' } | { kind: 'panel'; panelId: string };
    panels: Array<{
      id: string;
      type: string;
      title: string;
      config: Record<string, unknown>;
      createdAt: string | null;
    }>;
  };
};

async function loadLayoutModule(): Promise<LayoutModule> {
  return import('@/lib/workspacePanels/layout').catch(() => ({}));
}

describe('workspace panel layout normalization', () => {
  it('returns a chat-first empty layout when nothing is stored', async () => {
    const mod = await loadLayoutModule();

    expect(typeof mod.normalizeWorkspacePanelLayout).toBe('function');
    if (typeof mod.normalizeWorkspacePanelLayout !== 'function') return;

    expect(mod.normalizeWorkspacePanelLayout(null)).toEqual({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [],
    });
  });

  it('falls back to chat when the stored active panel no longer exists', async () => {
    const mod = await loadLayoutModule();

    expect(typeof mod.normalizeWorkspacePanelLayout).toBe('function');
    if (typeof mod.normalizeWorkspacePanelLayout !== 'function') return;

    expect(mod.normalizeWorkspacePanelLayout({
      version: 1,
      activePage: { kind: 'panel', panelId: 'missing-panel' },
      panels: [
        {
          id: 'panel-preview-1',
          type: 'preview',
          title: 'Preview',
          config: { port: 3305, path: '/' },
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      ],
    })).toEqual({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [
        {
          id: 'panel-preview-1',
          type: 'preview',
          title: 'Preview',
          config: { port: 3305, path: '/' },
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      ],
    });
  });
});
