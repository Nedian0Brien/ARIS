const configuredAppBasePath = process.env.NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX ?? '';

export function normalizeAppBasePath(basePath: string | undefined | null): string {
  const trimmed = (basePath ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function isExternalPath(path: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(path) || path.startsWith('//') || path.startsWith('mailto:') || path.startsWith('tel:');
}

export const APP_BASE_PATH = normalizeAppBasePath(configuredAppBasePath);

export function hasAppBasePath(basePath = APP_BASE_PATH): boolean {
  return normalizeAppBasePath(basePath).length > 0;
}

export function withAppBasePath(path: string, basePath = APP_BASE_PATH): string {
  if (!path || isExternalPath(path)) {
    return path;
  }

  const normalizedBasePath = normalizeAppBasePath(basePath);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!normalizedBasePath) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedBasePath || normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPath;
  }

  return `${normalizedBasePath}${normalizedPath}`;
}
