import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  getWorkspacePanelLayout: vi.fn(),
  createWorkspacePanel: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  getWorkspacePanelLayout: mocks.getWorkspacePanelLayout,
  createWorkspacePanel: mocks.createWorkspacePanel,
}));

type RouteModule = {
  GET?: (request: NextRequest, context: { params: Promise<{ sessionId: string }> }) => Promise<NextResponse>;
  POST?: (request: NextRequest, context: { params: Promise<{ sessionId: string }> }) => Promise<NextResponse>;
};

async function loadRouteModule(): Promise<RouteModule> {
  return import('@/app/api/runtime/sessions/[sessionId]/panels/route').catch(() => ({}));
}

describe('workspace panels route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
  });

  it('loads the stored panel layout for a workspace', async () => {
    mocks.getWorkspacePanelLayout.mockResolvedValue({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [],
    });

    const mod = await loadRouteModule();

    expect(typeof mod.GET).toBe('function');
    if (typeof mod.GET !== 'function') return;

    const response = await mod.GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels'),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getWorkspacePanelLayout).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'session-1',
    });

    await expect(response.json()).resolves.toEqual({
      layout: {
        version: 1,
        activePage: { kind: 'chat' },
        panels: [],
      },
    });
  });

  it('creates a preview panel for the current workspace', async () => {
    mocks.createWorkspacePanel.mockResolvedValue({
      version: 1,
      activePage: { kind: 'panel', panelId: 'panel-preview-1' },
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

    const mod = await loadRouteModule();

    expect(typeof mod.POST).toBe('function');
    if (typeof mod.POST !== 'function') return;

    const response = await mod.POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels', {
        method: 'POST',
        body: JSON.stringify({ type: 'preview' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createWorkspacePanel).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'session-1',
      type: 'preview',
    });

    await expect(response.json()).resolves.toEqual({
      layout: {
        version: 1,
        activePage: { kind: 'panel', panelId: 'panel-preview-1' },
        panels: [
          {
            id: 'panel-preview-1',
            type: 'preview',
            title: 'Preview',
            config: { port: 3305, path: '/' },
            createdAt: '2026-04-16T00:00:00.000Z',
          },
        ],
      },
    });
  });
});
