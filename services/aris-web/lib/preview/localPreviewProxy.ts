const LOCAL_PREVIEW_PREFIX = '/__local_preview';

export function normalizeLocalPreviewPath(pathname?: string | null): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function buildLocalPreviewBasePath(input: { sessionId: string; panelId: string }): string {
  return `${LOCAL_PREVIEW_PREFIX}/${encodeURIComponent(input.sessionId)}/${encodeURIComponent(input.panelId)}`;
}

export function buildLocalPreviewTargetUrl(input: { port: number; path?: string | null }): string {
  const pathname = normalizeLocalPreviewPath(input.path);
  return `http://127.0.0.1:${input.port}${pathname}`;
}

export function rewriteLocalPreviewHtml(html: string, previewBasePath: string): string {
  return html.replace(
    /\b(href|src)=("|')\/(?!\/)/g,
    (_match, attribute: string, quote: string) => `${attribute}=${quote}${previewBasePath}/`,
  );
}

export function parseLocalPreviewPort(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

export function normalizeLocalPreviewConfig(input: Record<string, unknown> | null | undefined): {
  port: number;
  path: string;
} {
  const parsedPort = parseLocalPreviewPort(typeof input?.port === 'number' || typeof input?.port === 'string'
    ? String(input.port)
    : null);

  return {
    port: parsedPort ?? 3305,
    path: normalizeLocalPreviewPath(typeof input?.path === 'string' ? input.path : '/'),
  };
}

export function buildLocalPreviewUrl(input: {
  sessionId: string;
  panelId: string;
  port: number;
  path?: string | null;
}): string {
  const basePath = buildLocalPreviewBasePath({
    sessionId: input.sessionId,
    panelId: input.panelId,
  });
  const pathname = normalizeLocalPreviewPath(input.path);
  const search = new URLSearchParams({
    port: String(input.port),
    path: pathname,
  });
  return `${basePath}/?${search.toString()}`;
}
