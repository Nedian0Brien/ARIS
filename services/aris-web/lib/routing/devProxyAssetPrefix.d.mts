export type DevProxyAssetPrefixOptions = {
  dev: boolean;
  port: number;
  serverPrefix?: string;
  clientPrefix?: string;
  autoProxyPrefix?: string;
};

export type DevProxyAssetPrefixResult = {
  serverPrefix: string;
  clientPrefix: string;
  changed: boolean;
};

export function normalizeDevAssetPrefix(value: string | undefined | null): string;
export function resolveDevProxyAssetPrefix(options: DevProxyAssetPrefixOptions): DevProxyAssetPrefixResult;
export function applyDevProxyAssetPrefix(
  env: NodeJS.ProcessEnv,
  options: Pick<DevProxyAssetPrefixOptions, 'dev' | 'port'>,
): DevProxyAssetPrefixResult;
