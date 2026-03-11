import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_CLAUDE_EVENT_TYPES = new Set([
  'file-history-snapshot',
  'change',
  'queue-operation',
]);

function normalizeSessionId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildProjectPath(workingDirectory: string): string {
  const projectId = resolve(workingDirectory).replace(/[^a-zA-Z0-9-]/g, '-');
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(claudeConfigDir, 'projects', projectId);
}

function extractFirstStringByKeys(records: Record<string, unknown>[], keys: string[]): string {
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

function collectNestedRecords(value: unknown): Record<string, unknown>[] {
  const stack: unknown[] = [value];
  const records: Record<string, unknown>[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      continue;
    }
    const record = current as Record<string, unknown>;
    records.push(record);
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) {
        for (const item of nested) {
          stack.push(item);
        }
      } else if (nested && typeof nested === 'object') {
        stack.push(nested);
      }
    }
  }
  return records;
}

async function readSessionLog(projectDir: string, sessionId: string): Promise<{ sessionId?: string; messageCount: number }> {
  try {
    const contents = await readFile(join(projectDir, `${sessionId}.jsonl`), 'utf8');
    let messageCount = 0;
    let discoveredSessionId = '';
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed);
        const records = collectNestedRecords(parsed);
        const eventType = extractFirstStringByKeys(records, ['type']);
        if (eventType && INTERNAL_CLAUDE_EVENT_TYPES.has(eventType)) {
          continue;
        }
        messageCount += 1;
        if (!discoveredSessionId) {
          discoveredSessionId = extractFirstStringByKeys(records, [
            'sessionId',
            'session_id',
            'resumeSessionId',
            'resume_session_id',
          ]);
        }
      } catch {
        continue;
      }
    }

    return {
      ...(normalizeSessionId(discoveredSessionId || sessionId) ? { sessionId: normalizeSessionId(discoveredSessionId || sessionId) } : {}),
      messageCount,
    };
  } catch {
    return { messageCount: 0 };
  }
}

async function listRecentSessionIds(projectDir: string, maxSessions: number): Promise<string[]> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(async (entry) => {
        const sessionId = entry.name.replace(/\.jsonl$/, '');
        if (!UUID_PATTERN.test(sessionId)) {
          return null;
        }
        try {
          const details = await stat(join(projectDir, entry.name));
          return {
            sessionId,
            mtimeMs: details.mtimeMs,
          };
        } catch {
          return null;
        }
      }));
    return files
      .filter((entry): entry is { sessionId: string; mtimeMs: number } => entry !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, maxSessions)
      .map((entry) => entry.sessionId);
  } catch {
    return [];
  }
}

export async function scanClaudeSessionLogs(input: {
  workingDirectory: string;
  hintedSessionIds?: string[];
  maxRecentSessions?: number;
}): Promise<{ sessionId?: string; source: 'hinted-log' | 'recent-log' | 'none'; inspectedSessionIds: string[] }> {
  const projectDir = buildProjectPath(input.workingDirectory);
  const hintedSessionIds = [...new Set((input.hintedSessionIds || []).map(normalizeSessionId).filter((value): value is string => Boolean(value)))];
  const recentSessionIds = await listRecentSessionIds(projectDir, input.maxRecentSessions ?? 3);
  const candidateSessionIds = [...hintedSessionIds];
  for (const recentSessionId of recentSessionIds) {
    if (!candidateSessionIds.includes(recentSessionId)) {
      candidateSessionIds.push(recentSessionId);
    }
  }

  for (const sessionId of candidateSessionIds) {
    const scanned = await readSessionLog(projectDir, sessionId);
    if (scanned.messageCount === 0 || !scanned.sessionId) {
      continue;
    }
    return {
      sessionId: scanned.sessionId,
      source: hintedSessionIds.includes(sessionId) ? 'hinted-log' : 'recent-log',
      inspectedSessionIds: candidateSessionIds,
    };
  }

  return {
    source: 'none',
    inspectedSessionIds: candidateSessionIds,
  };
}

export function extractClaudeSessionHintIds(args: string[]): string[] {
  const hints: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if ((current === '--session-id' || current === '--resume') && typeof args[index + 1] === 'string') {
      const next = normalizeSessionId(args[index + 1]);
      if (next) {
        hints.push(next);
      }
      index += 1;
    }
  }
  return [...new Set(hints)];
}
