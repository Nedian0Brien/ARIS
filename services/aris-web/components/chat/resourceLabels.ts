import {
  normalizeLocalPathTarget,
  parseLocalFileReferenceTarget,
} from './chatFileReferences';

const FOLDER_LABELS = ['src', 'app', 'components', 'lib', 'styles', 'tests', 'docs', 'prisma', 'public'] as const;

export type FolderLabel = (typeof FOLDER_LABELS)[number];

export type ResourceLabel =
  | { kind: 'folder'; name: FolderLabel; sourcePath?: string; sourceLine?: number | null }
  | { kind: 'file'; name: string; extension: string; sourcePath?: string; sourceLine?: number | null };

function isFolderLabel(value: string): value is FolderLabel {
  return (FOLDER_LABELS as readonly string[]).includes(value);
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

export function classifyLabelLink(label: string, rawPath: string): ResourceLabel | null {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return null;
  }

  const normalizedPath = normalizeLocalPathTarget(rawPath);
  if (!normalizedPath) {
    return null;
  }

  const folderCandidate = normalizedLabel.toLowerCase();
  if (isFolderLabel(folderCandidate)) {
    return {
      kind: 'folder',
      name: folderCandidate,
      sourcePath: normalizedPath.path,
      sourceLine: normalizedPath.line,
    };
  }

  const parsedFile = parseLocalFileReferenceTarget(rawPath);
  if (parsedFile) {
    const displayName = fileExtension(normalizedLabel) ? normalizedLabel : parsedFile.name;
    return {
      kind: 'file',
      name: displayName,
      extension: parsedFile.extension,
      sourcePath: parsedFile.path,
      sourceLine: parsedFile.line,
    };
  }

  return null;
}
