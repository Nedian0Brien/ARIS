export type DiffStats = {
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
};

const ADD_KINDS = new Set(['add', 'create', 'new']);
const DELETE_KINDS = new Set(['delete', 'remove', 'removed']);

function countChangedLines(raw: string): number {
  const normalized = raw.replace(/\r\n/g, '\n').trimEnd();
  if (!normalized.trim()) {
    return 0;
  }
  return normalized.split('\n').length;
}

export function summarizeDiffText(raw: string): DiffStats {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      additions: 0,
      deletions: 0,
      hasDiffSignal: false,
    };
  }

  const lines = normalized.split('\n');
  let additions = 0;
  let deletions = 0;
  let hasStructuralSignal = false;
  let hasHunkHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const lowered = trimmed.toLowerCase();

    if (
      trimmed.startsWith('diff --git ')
      || /^(\+\+\+|---)\s+[ab]\//.test(trimmed)
      || lowered.startsWith('*** begin patch')
      || lowered.startsWith('*** update file:')
      || lowered.startsWith('*** add file:')
      || lowered.startsWith('*** delete file:')
    ) {
      hasStructuralSignal = true;
    }

    if (trimmed.startsWith('@@ ')) {
      hasStructuralSignal = true;
      hasHunkHeader = true;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }

  const hasLineDelta = additions > 0 || deletions > 0;
  const hasDiffSignal = hasStructuralSignal || (hasLineDelta && hasHunkHeader);

  return {
    additions,
    deletions,
    hasDiffSignal,
  };
}

export function summarizeFileChangeDiff(raw: string, kind?: string): DiffStats {
  const base = summarizeDiffText(raw);
  if (base.hasDiffSignal) {
    return base;
  }

  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  const lineCount = countChangedLines(raw);
  if (lineCount <= 0) {
    return base;
  }

  if (ADD_KINDS.has(normalizedKind)) {
    return {
      additions: lineCount,
      deletions: 0,
      hasDiffSignal: true,
    };
  }

  if (DELETE_KINDS.has(normalizedKind)) {
    return {
      additions: 0,
      deletions: lineCount,
      hasDiffSignal: true,
    };
  }

  return base;
}
