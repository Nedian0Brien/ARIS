import { describe, expect, it } from 'vitest';

type PreviewGatewayModule = {
  buildLocalPreviewBasePath?: (input: { sessionId: string; panelId: string }) => string;
  buildLocalPreviewTargetUrl?: (input: { port: number; path?: string | null }) => string;
  rewriteLocalPreviewHtml?: (html: string, previewBasePath: string) => string;
};

async function loadPreviewGatewayModule(): Promise<PreviewGatewayModule> {
  return import('@/lib/preview/localPreviewProxy').catch(() => ({}));
}

describe('local preview gateway helpers', () => {
  it('builds a stable local preview base path for a session panel', async () => {
    const mod = await loadPreviewGatewayModule();

    expect(typeof mod.buildLocalPreviewBasePath).toBe('function');
    if (typeof mod.buildLocalPreviewBasePath !== 'function') return;

    expect(mod.buildLocalPreviewBasePath({
      sessionId: 'session-1',
      panelId: 'panel-preview-1',
    })).toBe('/__local_preview/session-1/panel-preview-1');
  });

  it('builds a loopback target URL from port and path', async () => {
    const mod = await loadPreviewGatewayModule();

    expect(typeof mod.buildLocalPreviewTargetUrl).toBe('function');
    if (typeof mod.buildLocalPreviewTargetUrl !== 'function') return;

    expect(mod.buildLocalPreviewTargetUrl({
      port: 3305,
      path: '/dashboard',
    })).toBe('http://127.0.0.1:3305/dashboard');
  });

  it('rewrites root-relative asset paths under the preview base path', async () => {
    const mod = await loadPreviewGatewayModule();

    expect(typeof mod.rewriteLocalPreviewHtml).toBe('function');
    if (typeof mod.rewriteLocalPreviewHtml !== 'function') return;

    const nextHtml = [
      '<html><head>',
      '<script src="/_next/static/chunk.js"></script>',
      '</head><body>',
      '<a href="/login">login</a>',
      '</body></html>',
    ].join('');

    const rewritten = mod.rewriteLocalPreviewHtml(nextHtml, '/__local_preview/session-1/panel-preview-1');

    expect(rewritten).toContain('src="/__local_preview/session-1/panel-preview-1/_next/static/chunk.js"');
    expect(rewritten).toContain('href="/__local_preview/session-1/panel-preview-1/login"');
  });
});
