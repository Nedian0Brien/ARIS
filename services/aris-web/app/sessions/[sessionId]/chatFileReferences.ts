export type ParsedLocalFileReference = {
  path: string;
  line: number | null;
  extension: string;
  name: string;
};

export type MarkdownLinkMatch = {
  fullMatch: string;
  label: string;
  target: string;
};

export type PlainTextFileReferenceToken =
  | { type: 'text'; value: string }
  | {
    type: 'file';
    value: string;
    path: string;
    line: number | null;
    extension: string;
    name: string;
  };

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((<[^>]+>|[^)\n]+?)\)/g;
const PLAIN_TEXT_PATH_PATTERN = /(?:\/|\.{1,2}\/|[A-Za-z0-9_-]+\/)[^\s)\]}",'`]+?\.[A-Za-z0-9]+(?::\d+)?(?=$|[\s)\]}",'`.,;!?])/g;

function isExternalUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value) || /^file:\/\//i.test(value);
}

function fileExtension(filename: string): string {
  const base = filename.trim().split('/').pop() ?? '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return '';
  }
  const ext = base.slice(dotIndex + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(ext) ? ext : '';
}

function unwrapMarkdownTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitLineSuffix(value: string): { path: string; line: number | null } {
  const match = value.match(/^(.*?):(\d+)$/);
  if (!match) {
    return { path: value, line: null };
  }

  const line = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(line) || line <= 0) {
    return { path: value, line: null };
  }
  return { path: match[1] ?? value, line };
}

function hasLocalPathShape(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.startsWith('/')) {
    return value.includes('/');
  }
  if (value.startsWith('./') || value.startsWith('../')) {
    return true;
  }

  const segments = value.split('/').filter(Boolean);
  if (segments.length < 2) {
    return false;
  }

  const first = segments[0] ?? '';
  return !first.includes('.');
}

export function normalizeLocalPathTarget(rawTarget: string): { path: string; line: number | null } | null {
  const unwrapped = unwrapMarkdownTarget(rawTarget);
  if (!unwrapped || isExternalUrl(unwrapped)) {
    return null;
  }

  const { path, line } = splitLineSuffix(unwrapped);
  const normalizedPath = path.trim();
  if (!hasLocalPathShape(normalizedPath)) {
    return null;
  }

  return { path: normalizedPath, line };
}

export function parseLocalFileReferenceTarget(rawTarget: string): ParsedLocalFileReference | null {
  const normalized = normalizeLocalPathTarget(rawTarget);
  if (!normalized) {
    return null;
  }

  const extension = fileExtension(normalized.path);
  if (!extension) {
    return null;
  }

  const name = normalized.path.split('/').filter(Boolean).pop() ?? normalized.path;
  return {
    path: normalized.path,
    line: normalized.line,
    extension,
    name,
  };
}

export function scanMarkdownLinks(source: string): MarkdownLinkMatch[] {
  const matches: MarkdownLinkMatch[] = [];
  for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
    matches.push({
      fullMatch: match[0],
      label: match[1] ?? '',
      target: match[2] ?? '',
    });
  }
  return matches;
}

export function tokenizePlainTextFileReferences(text: string): PlainTextFileReferenceToken[] {
  const tokens: PlainTextFileReferenceToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(PLAIN_TEXT_PATH_PATTERN)) {
    const value = match[0] ?? '';
    const index = match.index ?? 0;
    const parsed = parseLocalFileReferenceTarget(value);
    if (!parsed) {
      continue;
    }

    if (index > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, index) });
    }

    tokens.push({
      type: 'file',
      value,
      path: parsed.path,
      line: parsed.line,
      extension: parsed.extension,
      name: parsed.name,
    });
    cursor = index + value.length;
  }

  if (cursor < text.length || tokens.length === 0) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens;
}
