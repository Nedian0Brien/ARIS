import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

type PreviewRouteModule = {
  GET?: (request: NextRequest, context: { params: Promise<{ sessionId: string; panelId: string }> }) => Promise<Response>;
};

async function loadPreviewRouteModule(): Promise<PreviewRouteModule> {
  return import('@/app/api/runtime/sessions/[sessionId]/panels/[panelId]/preview-url/route').catch(() => ({}));
}

describe('preview url route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
  });

  it('returns a local preview url for a valid port', async () => {
    const mod = await loadPreviewRouteModule();

    expect(typeof mod.GET).toBe('function');
    if (typeof mod.GET !== 'function') return;

    const response = await mod.GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels/panel-preview-1/preview-url?port=3305&path=%2F'),
      { params: Promise.resolve({ sessionId: 'session-1', panelId: 'panel-preview-1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      previewUrl: '/__local_preview/session-1/panel-preview-1/?port=3305&path=%2F',
    });
  });

  it('rejects non-numeric ports', async () => {
    const mod = await loadPreviewRouteModule();

    expect(typeof mod.GET).toBe('function');
    if (typeof mod.GET !== 'function') return;

    const response = await mod.GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/panels/panel-preview-1/preview-url?port=nope'),
      { params: Promise.resolve({ sessionId: 'session-1', panelId: 'panel-preview-1' }) },
    );

    expect(response.status).toBe(400);
  });
});
