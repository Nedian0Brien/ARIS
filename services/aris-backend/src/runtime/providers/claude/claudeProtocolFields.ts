const CLAUDE_OBSERVED_SESSION_ID_KEYS = [
  'session_id',
  'sessionId',
  'sessionid',
  'resume_session_id',
  'resumeSessionId',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseClaudeJsonLine(line: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
}

export function collectClaudeNestedRecords(root: unknown): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const records: Record<string, unknown>[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const record = asRecord(current);
    if (!record) {
      continue;
    }
    records.push(record);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return records;
}

export function extractFirstClaudeStringByKeys(records: Record<string, unknown>[], keys: readonly string[]): string {
  for (const key of keys) {
    for (const record of records) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

export function extractClaudeObservedSessionId(value: unknown): string | undefined {
  const records = Array.isArray(value)
    ? value as Record<string, unknown>[]
    : collectClaudeNestedRecords(value);
  const sessionId = extractFirstClaudeStringByKeys(records, CLAUDE_OBSERVED_SESSION_ID_KEYS);
  return sessionId || undefined;
}
