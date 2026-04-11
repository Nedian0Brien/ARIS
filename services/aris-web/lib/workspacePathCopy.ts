function normalizeWorkspaceClientPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

export function getWorkspaceAbsolutePathForCopy(targetPath: string): string {
  return normalizeWorkspaceClientPath(targetPath);
}

export function getWorkspaceRelativePathForCopy(targetPath: string, workspaceRootPath: string): string {
  const normalizedTarget = normalizeWorkspaceClientPath(targetPath);
  const normalizedRoot = normalizeWorkspaceClientPath(workspaceRootPath);

  if (normalizedTarget === normalizedRoot) {
    return '.';
  }

  if (normalizedRoot === '/') {
    return normalizedTarget.slice(1);
  }

  if (!normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget;
  }

  return normalizedTarget.slice(normalizedRoot.length + 1);
}
