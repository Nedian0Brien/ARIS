/**
 * Codex raw payload key normalization.
 *
 * Mirrors the precedent in `claudeProtocolFields.ts`: a single module owns
 * extraction of canonical fields (`threadId`, request id, etc.) from raw
 * codex payloads, regardless of casing variation between the two channels
 * (app-server JSON-RPC vs exec stdout JSON).
 *
 * Phase 2 Sprint 2 introduces the placeholder. Sprint 3 will fill it with
 * real extractors against captured fixtures (see
 * `docs/03-platform/codex-protocol-conformance.md`).
 */

const CODEX_OBSERVED_THREAD_ID_KEYS = [
  'thread_id',
  'threadId',
  'threadid',
  'resume_thread_id',
  'resumeThreadId',
] as const;

const CODEX_REQUEST_ID_KEYS = ['request_id', 'requestId', 'id'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseCodexJsonLine(
  line: string,
  onParseWarning?: (rawLine: string) => void,
): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    onParseWarning?.(line);
    return null;
  }
}

export function collectCodexNestedRecords(root: unknown): Record<string, unknown>[] {
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

export function extractFirstCodexStringByKeys(
  records: Record<string, unknown>[],
  keys: readonly string[],
): string {
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

export function extractCodexObservedThreadId(value: unknown): string | undefined {
  const records = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : collectCodexNestedRecords(value);
  const threadId = extractFirstCodexStringByKeys(records, CODEX_OBSERVED_THREAD_ID_KEYS);
  return threadId || undefined;
}

export function extractCodexRequestId(value: unknown): string | number | undefined {
  const records = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : collectCodexNestedRecords(value);
  for (const key of CODEX_REQUEST_ID_KEYS) {
    for (const record of records) {
      const v = record[key];
      if (typeof v === 'string' && v.trim().length > 0) {
        return v.trim();
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
    }
  }
  return undefined;
}
