import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  updateWorkspacePanel: vi.fn(),
  deleteWorkspacePanel: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  updateWorkspacePanel: mocks.updateWorkspacePanel,
  deleteWorkspacePanel: mocks.deleteWorkspacePanel,
}));

type RouteModule = {
  PATCH?: (
    request: NextRequest,
    context: { params: Promise<{ sessionId: string; panelId: string }> },
  ) => Promise<Response>;
  DELETE?: (
    request: NextRequest,
    context: { params: Promise<{ sessionId: string; panelId: string }> },
  ) => Promise<Response>;
};

async function loadRouteModule(): Promise<RouteModule> {
  return import('@/app/api/runtime/sessions/[sessionId]/panels/[panelId]/route').catch(() => ({}));
}

describe('workspace panel detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
  });

  it('updates preview panel config for the current workspace', async () => {
    mocks.updateWorkspacePanel.mockResolvedValue({
      version: 1,
      activePage: { kind: 'panel', panelId: 'panel-preview-1' },
      panels: [
        {
          id: 'panel-preview-1',
          type: 'preview',
          title: 'Preview',
          config: { port: 5173, path: '/dashboard' },
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      ],
    });

    const mod = await loadRouteModule();

    expect(typeof mod.PATCH).toBe('function');
    if (typeof mod.PATCH !== 'function') return;

    const response = await mod.PATCH(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels/panel-preview-1', {
        method: 'PATCH',
        body: JSON.stringify({ config: { port: 5173, path: '/dashboard' } }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1', panelId: 'panel-preview-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspacePanel).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'session-1',
      panelId: 'panel-preview-1',
      title: undefined,
      config: { port: 5173, path: '/dashboard' },
    });
  });

  it('deletes the requested panel', async () => {
    mocks.deleteWorkspacePanel.mockResolvedValue({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [],
    });

    const mod = await loadRouteModule();

    expect(typeof mod.DELETE).toBe('function');
    if (typeof mod.DELETE !== 'function') return;

    const response = await mod.DELETE(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels/panel-preview-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ sessionId: 'session-1', panelId: 'panel-preview-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteWorkspacePanel).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'session-1',
      panelId: 'panel-preview-1',
    });
  });
});
