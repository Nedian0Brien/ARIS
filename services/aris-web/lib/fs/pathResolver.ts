import path from 'node:path';
import { env } from '@/lib/config';

const WORKSPACE_ROOT = '/workspace';

function stripTrailingSlashes(input: string): string {
  return input.replace(/\/+$/, '') || '/';
}

function normalizeAbsolutePath(input: string): string {
  return stripTrailingSlashes(path.resolve(input));
}

export function getHostHomeDir(): string {
  return normalizeAbsolutePath(env.HOST_HOME_DIR.trim() || '/home/ubuntu');
}

export function getHostProjectsRoot(): string | null {
  const raw = env.HOST_PROJECTS_ROOT.trim();
  return raw ? normalizeAbsolutePath(raw) : null;
}

export function getDefaultBrowseRoot(): string {
  return getHostHomeDir();
}

export function mapWorkspacePathToHost(input: string): string {
  const normalized = normalizeAbsolutePath(input);
  const hostProjectsRoot = getHostProjectsRoot();
  if (!hostProjectsRoot) {
    return normalized;
  }

  if (normalized === WORKSPACE_ROOT) {
    return hostProjectsRoot;
  }

  if (normalized.startsWith(`${WORKSPACE_ROOT}/`)) {
    const relativePath = normalized.slice(`${WORKSPACE_ROOT}/`.length);
    return normalizeAbsolutePath(path.join(hostProjectsRoot, relativePath));
  }

  return normalized;
}

function normalizeWorkspaceVisiblePath(input?: string | null): string {
  const raw = typeof input === 'string' ? input.replace(/\\/g, '/').trim() : '';
  if (!raw || raw === '/') {
    return WORKSPACE_ROOT;
  }

  if (path.isAbsolute(raw)) {
    const normalized = stripTrailingSlashes(path.posix.normalize(raw));
    if (normalized === WORKSPACE_ROOT || normalized.startsWith(`${WORKSPACE_ROOT}/`)) {
      return normalized;
    }
    throw new Error(`패널 파일 조회는 ${WORKSPACE_ROOT} 경로만 사용할 수 있습니다.`);
  }

  return stripTrailingSlashes(path.posix.normalize(path.posix.join(WORKSPACE_ROOT, raw)));
}

export function normalizeVisiblePath(input?: string | null): string {
  const raw = typeof input === 'string' ? input.replace(/\\/g, '/').trim() : '';
  if (!raw || raw === '/') {
    return getDefaultBrowseRoot();
  }

  if (path.isAbsolute(raw)) {
    return mapWorkspacePathToHost(raw);
  }

  return normalizeAbsolutePath(path.join(getDefaultBrowseRoot(), raw));
}

export function assertAllowedPath(input: string): string {
  const normalized = normalizeAbsolutePath(input);
  const roots = new Set<string>([
    WORKSPACE_ROOT,
    getHostHomeDir(),
  ]);
  const hostProjectsRoot = getHostProjectsRoot();
  if (hostProjectsRoot) {
    roots.add(hostProjectsRoot);
  }

  for (const root of roots) {
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return normalized;
    }
  }

  throw new Error(`허용되지 않은 경로입니다: ${normalized}`);
}

function assertInsideRoot(input: string, root: string): string {
  const normalized = normalizeAbsolutePath(input);
  const normalizedRoot = normalizeAbsolutePath(root);
  if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized;
  }
  throw new Error(`허용되지 않은 패널 경로입니다: ${normalized}`);
}

function mapWorkspacePathToExecutionRoot(visiblePath: string, executionRoot: string): string {
  const normalizedRoot = assertAllowedPath(executionRoot);
  const normalizedVisiblePath = normalizeWorkspaceVisiblePath(visiblePath);
  if (normalizedVisiblePath === WORKSPACE_ROOT) {
    return normalizedRoot;
  }
  const relativePath = normalizedVisiblePath.slice(`${WORKSPACE_ROOT}/`.length);
  return assertInsideRoot(path.join(normalizedRoot, relativePath), normalizedRoot);
}

export function resolveFsPath(
  input?: string | null,
  options: { executionRoot?: string | null } = {},
): { visiblePath: string; runtimePath: string; rootPath: string } {
  if (options.executionRoot?.trim()) {
    const visiblePath = normalizeWorkspaceVisiblePath(input);
    const runtimePath = mapWorkspacePathToExecutionRoot(visiblePath, options.executionRoot);
    return { visiblePath, runtimePath, rootPath: WORKSPACE_ROOT };
  }

  const visiblePath = normalizeVisiblePath(input);
  const runtimePath = assertAllowedPath(visiblePath);
  return { visiblePath, runtimePath, rootPath: getDefaultBrowseRoot() };
}
