import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { collectClaudeNestedRecords, extractClaudeObservedSessionId, extractFirstClaudeStringByKeys } from './claudeProtocolFields.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_CLAUDE_EVENT_TYPES = new Set([
  'file-history-snapshot',
  'change',
  'queue-operation',
]);

type ClaudeSessionCursor = {
  offset: number;
  processedKeys: Set<string>;
};

export type ClaudeSessionScanEvent = {
  sessionId: string;
  eventKey: string;
  eventType?: string;
  discoveredSessionId?: string;
};

export type ClaudeSessionScanResult = {
  sessionId?: string;
  source: 'hinted-log' | 'recent-log' | 'none';
  inspectedSessionIds: string[];
  currentSessionId?: string;
  pendingSessionIds: string[];
  finishedSessionIds: string[];
  events: ClaudeSessionScanEvent[];
};

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

function extractEventKey(sessionId: string, line: string, records: Record<string, unknown>[]): string {
  const uuid = extractFirstClaudeStringByKeys(records, ['uuid', 'id', 'messageId', 'message_id']);
  if (uuid) {
    return `${sessionId}:${uuid}`;
  }
  return `${sessionId}:${line}`;
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

async function readSessionLogDelta(projectDir: string, sessionId: string, cursor: ClaudeSessionCursor): Promise<ClaudeSessionScanEvent[]> {
  try {
    const filePath = join(projectDir, `${sessionId}.jsonl`);
    const contents = await readFile(filePath, 'utf8');
    if (cursor.offset > contents.length) {
      cursor.offset = 0;
      cursor.processedKeys.clear();
    }
    const delta = contents.slice(cursor.offset);
    cursor.offset = contents.length;
    if (!delta.trim()) {
      return [];
    }

    const events: ClaudeSessionScanEvent[] = [];
    for (const line of delta.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed);
        const records = collectClaudeNestedRecords(parsed);
        const eventType = extractFirstClaudeStringByKeys(records, ['type']);
        if (eventType && INTERNAL_CLAUDE_EVENT_TYPES.has(eventType)) {
          continue;
        }
        const discoveredSessionId = normalizeSessionId(extractClaudeObservedSessionId(records));
        const eventKey = extractEventKey(sessionId, trimmed, records);
        if (cursor.processedKeys.has(eventKey)) {
          continue;
        }
        cursor.processedKeys.add(eventKey);
        events.push({
          sessionId,
          eventKey,
          ...(eventType ? { eventType } : {}),
          ...(discoveredSessionId ? { discoveredSessionId } : {}),
        });
      } catch {
        continue;
      }
    }

    return events;
  } catch {
    return [];
  }
}

export class ClaudeSessionLogTracker {
  private readonly projectDir: string;
  private readonly maxRecentSessions: number;
  private readonly hintedSessionIds = new Set<string>();
  private readonly candidateSessionIds: string[] = [];
  private readonly cursors = new Map<string, ClaudeSessionCursor>();
  private currentSessionId?: string;
  private readonly pendingSessionIds = new Set<string>();
  private readonly finishedSessionIds = new Set<string>();

  constructor(input: {
    workingDirectory: string;
    hintedSessionIds?: string[];
    maxRecentSessions?: number;
  }) {
    this.projectDir = buildProjectPath(input.workingDirectory);
    this.maxRecentSessions = input.maxRecentSessions ?? 3;
    this.trackSessionIds(input.hintedSessionIds ?? [], { hinted: true });
  }

  trackSessionIds(sessionIds: string[], options: { hinted?: boolean } = {}): void {
    for (const rawSessionId of sessionIds) {
      const sessionId = normalizeSessionId(rawSessionId);
      if (!sessionId) {
        continue;
      }
      if (options.hinted) {
        this.hintedSessionIds.add(sessionId);
      }
      if (!this.candidateSessionIds.includes(sessionId)) {
        this.candidateSessionIds.push(sessionId);
      }
      if (!this.cursors.has(sessionId)) {
        this.cursors.set(sessionId, {
          offset: 0,
          processedKeys: new Set<string>(),
        });
      }
      if (this.currentSessionId && this.currentSessionId !== sessionId && !this.finishedSessionIds.has(sessionId)) {
        this.pendingSessionIds.add(sessionId);
      }
    }
  }

  async poll(): Promise<ClaudeSessionScanResult> {
    const recentSessionIds = await listRecentSessionIds(this.projectDir, this.maxRecentSessions);
    this.trackSessionIds(recentSessionIds);

    const events: ClaudeSessionScanEvent[] = [];
    const touchedSessionIds: string[] = [];
    const hadCurrentSession = Boolean(this.currentSessionId);
    for (const sessionId of this.candidateSessionIds) {
      const cursor = this.cursors.get(sessionId);
      if (!cursor) {
        continue;
      }
      const nextEvents = await readSessionLogDelta(this.projectDir, sessionId, cursor);
      if (nextEvents.length === 0) {
        continue;
      }

      touchedSessionIds.push(sessionId);
      if (this.currentSessionId && this.currentSessionId !== sessionId) {
        this.finishedSessionIds.add(this.currentSessionId);
        this.pendingSessionIds.delete(this.currentSessionId);
        this.currentSessionId = sessionId;
      }
      this.pendingSessionIds.delete(sessionId);
      for (const event of nextEvents) {
        if (event.discoveredSessionId && event.discoveredSessionId !== sessionId) {
          this.trackSessionIds([event.discoveredSessionId]);
        }
      }
      events.push(...nextEvents);
    }

    if (!hadCurrentSession && touchedSessionIds.length > 0) {
      const mostRecentTouchedSession = recentSessionIds.find((sessionId) => touchedSessionIds.includes(sessionId))
        ?? touchedSessionIds[0];
      this.currentSessionId = mostRecentTouchedSession;
    }

    const resolvedSessionId = this.currentSessionId
      ?? events[events.length - 1]?.discoveredSessionId
      ?? events[events.length - 1]?.sessionId;
    const source = !resolvedSessionId
      ? 'none'
      : this.hintedSessionIds.has(resolvedSessionId)
        ? 'hinted-log'
        : 'recent-log';

    return {
      ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {}),
      source,
      inspectedSessionIds: [...this.candidateSessionIds],
      ...(this.currentSessionId ? { currentSessionId: this.currentSessionId } : {}),
      pendingSessionIds: [...this.pendingSessionIds],
      finishedSessionIds: [...this.finishedSessionIds],
      events,
    };
  }
}

export async function scanClaudeSessionLogs(input: {
  workingDirectory: string;
  hintedSessionIds?: string[];
  maxRecentSessions?: number;
}): Promise<ClaudeSessionScanResult> {
  const tracker = new ClaudeSessionLogTracker(input);
  return tracker.poll();
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
