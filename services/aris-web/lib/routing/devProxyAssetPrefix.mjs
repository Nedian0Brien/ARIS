const PROXY_PORT_PREFIX_PATTERN = /^\/proxy\/\d+$/;

export function normalizeDevAssetPrefix(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function shouldReplaceWithCurrentProxyPrefix(value, expectedProxyPrefix) {
  const normalized = normalizeDevAssetPrefix(value);
  return !normalized || (PROXY_PORT_PREFIX_PATTERN.test(normalized) && normalized !== expectedProxyPrefix);
}

export function resolveDevProxyAssetPrefix({
  dev,
  port,
  serverPrefix,
  clientPrefix,
  autoProxyPrefix,
}) {
  const normalizedServerPrefix = normalizeDevAssetPrefix(serverPrefix);
  const normalizedClientPrefix = normalizeDevAssetPrefix(clientPrefix);

  if (!dev || autoProxyPrefix === '0' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      serverPrefix: normalizedServerPrefix,
      clientPrefix: normalizedClientPrefix,
      changed: false,
    };
  }

  const expectedProxyPrefix = `/proxy/${port}`;
  const nextServerPrefix = shouldReplaceWithCurrentProxyPrefix(serverPrefix, expectedProxyPrefix)
    ? expectedProxyPrefix
    : normalizedServerPrefix;
  const nextClientPrefix = shouldReplaceWithCurrentProxyPrefix(clientPrefix, expectedProxyPrefix)
    ? nextServerPrefix
    : normalizedClientPrefix;

  return {
    serverPrefix: nextServerPrefix,
    clientPrefix: nextClientPrefix,
    changed: nextServerPrefix !== normalizedServerPrefix || nextClientPrefix !== normalizedClientPrefix,
  };
}

export function applyDevProxyAssetPrefix(env, { dev, port }) {
  const resolved = resolveDevProxyAssetPrefix({
    dev,
    port,
    serverPrefix: env.ARIS_WEB_ASSET_PREFIX,
    clientPrefix: env.NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX,
    autoProxyPrefix: env.ARIS_WEB_AUTO_PROXY_PREFIX,
  });

  if (resolved.serverPrefix) {
    env.ARIS_WEB_ASSET_PREFIX = resolved.serverPrefix;
  }

  if (resolved.clientPrefix) {
    env.NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX = resolved.clientPrefix;
  }

  return resolved;
}

export function isNextDevHmrPath(pathname, assetPrefix) {
  const normalizedAssetPrefix = normalizeDevAssetPrefix(assetPrefix);
  const hmrPath = '/_next/webpack-hmr';

  return pathname === hmrPath || Boolean(normalizedAssetPrefix && pathname === `${normalizedAssetPrefix}${hmrPath}`);
}

export function withNextDevHmrAssetPrefix(reqUrl, assetPrefix) {
  const normalizedAssetPrefix = normalizeDevAssetPrefix(assetPrefix);
  const hmrPath = '/_next/webpack-hmr';

  if (!normalizedAssetPrefix || typeof reqUrl !== 'string') {
    return reqUrl;
  }

  if (reqUrl === hmrPath || reqUrl.startsWith(`${hmrPath}?`)) {
    return `${normalizedAssetPrefix}${reqUrl}`;
  }

  return reqUrl;
}
