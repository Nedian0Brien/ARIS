export const FOLDER_LABELS = ['src', 'tools', 'jobs', 'scripts', 'tests'] as const;

export type FolderLabel = (typeof FOLDER_LABELS)[number];
export type ResourceLabel =
  | { kind: 'folder'; name: FolderLabel; sourcePath?: string }
  | { kind: 'file'; name: string; extension: string; sourcePath?: string };

function isFolderLabel(label: string): label is FolderLabel {
  return (FOLDER_LABELS as readonly string[]).includes(label);
}

function fileExtension(filename: string): string {
  const base = filename.trim().split('/').pop() ?? '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return '';
  }
  const ext = base.slice(dotIndex + 1).toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) return '';
  return ext;
}

function looksLikeWorkspacePath(rawPath: string): boolean {
  return /^\/?(?:home|workspace|Users|private|tmp|var|opt|mnt|srv|media|Volumes|System|Applications)\b/i.test(rawPath);
}

function normalizePathLike(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) {
    return '';
  }

  const collapsed = trimmed.replace(/\/+/g, '/');
  return collapsed === '/' ? '/' : collapsed.replace(/\/$/, '');
}

function resolveInternalResourcePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      return normalizePathLike(new URL(trimmed).pathname);
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (looksLikeWorkspacePath(url.pathname)) {
        return normalizePathLike(decodeURIComponent(url.pathname));
      }
    } catch {
      return null;
    }
    return null;
  }

  if (/^\/?[\w./-]+$/.test(trimmed)) {
    return normalizePathLike(trimmed);
  }

  return null;
}

function classifyByLabel(label: string, sourcePath?: string): ResourceLabel | null {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return null;
  }

  const folderCandidate = normalizedLabel.toLowerCase();
  if (isFolderLabel(folderCandidate)) {
    return { kind: 'folder', name: folderCandidate, sourcePath };
  }

  const extension = fileExtension(normalizedLabel);
  if (extension) {
    return { kind: 'file', name: normalizedLabel, extension, sourcePath };
  }

  return null;
}

export function classifyMarkdownLink(label: string, rawPath: string): ResourceLabel | null {
  const normalizedLabel = label.trim();
  const sourcePath = resolveInternalResourcePath(rawPath) ?? rawPath.trim();
  const pathCandidate = sourcePath || rawPath.trim();

  if (!normalizedLabel && !pathCandidate) {
    return null;
  }

  if (pathCandidate) {
    const basename = pathCandidate.split('/').filter(Boolean).pop() ?? pathCandidate;
    const folderCandidate = basename.toLowerCase();
    const extension = fileExtension(basename);

    if (extension) {
      return {
        kind: 'file',
        name: normalizedLabel || basename,
        extension,
        sourcePath: sourcePath || rawPath.trim(),
      };
    }

    if (isFolderLabel(folderCandidate)) {
      return {
        kind: 'folder',
        name: folderCandidate,
        sourcePath: sourcePath || rawPath.trim(),
      };
    }
  }

  return classifyByLabel(normalizedLabel, rawPath.trim());
}
