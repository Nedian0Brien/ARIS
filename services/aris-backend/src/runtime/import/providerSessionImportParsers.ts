import type { ChatUsageStats, ChatUsageTotals } from '../../types.js';

export type ImportedAgentProvider = 'codex' | 'claude';

export type ImportedProviderMessage = {
  role: 'user' | 'assistant';
  text: string;
  sourceEventKey: string;
  sourceOffset: bigint;
  sourceCreatedAt?: Date;
};

export type ParsedProviderSessionLog = {
  provider: ImportedAgentProvider;
  providerSessionId: string;
  sourcePath: string;
  projectPath?: string;
  messages: ImportedProviderMessage[];
  oldestCursorOffset: bigint | null;
  newestCursorOffset: bigint | null;
  hasMoreBefore: boolean;
  /**
   * True when the transcript is a Claude Code subagent (Task tool) sidechain —
   * every message-bearing record carried `isSidechain: true`. Subagent
   * transcripts must not appear in the main chat list; they are surfaced only
   * in the subagent sidebar. Always false for Codex (no sidechain concept).
   */
  isSubagent: boolean;
  /**
   * transcript에서 수집한 실측 토큰 usage. Claude는 assistant 레코드의
   * message.usage를 누적해 채운다. Codex rollout 파일에는 usage가 없어 null
   * (Codex는 라이브 app-server 알림으로 수집).
   */
  usage: ChatUsageStats | null;
};

type ParseOptions = {
  sourcePath: string;
  fallbackSessionId?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseDate(value: unknown): Date | undefined {
  const raw = readString(value);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function parseJsonLine(line: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function splitJsonlWithOffsets(contents: string): Array<{ line: string; offset: bigint }> {
  const rows: Array<{ line: string; offset: bigint }> = [];
  let offset = 0;
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line) {
      rows.push({ line, offset: BigInt(offset) });
    }
    offset += rawLine.length + 1;
  }
  return rows;
}

function extractContentText(value: unknown): string | undefined {
  const direct = readString(value);
  if (direct) {
    return direct;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (isRecord(item)) {
          const itemType = readString(item.type);
          if (itemType && itemType !== 'text' && itemType !== 'input_text' && itemType !== 'output_text') {
            return undefined;
          }
          return readString(item.text);
        }
        return readString(item);
      })
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join('\n') : undefined;
  }
  if (isRecord(value)) {
    return extractContentText(value.content) ?? readString(value.text);
  }
  return undefined;
}

function buildEventKey(sessionId: string, offset: bigint, record: JsonRecord): string {
  const id = readString(record.uuid) ?? readString(record.id) ?? readString(record.messageId) ?? readString(record.message_id);
  return id ? `${sessionId}:${id}` : `${sessionId}:offset:${offset.toString()}`;
}

function finalizeParsedLog(input: {
  provider: ImportedAgentProvider;
  providerSessionId?: string;
  sourcePath: string;
  projectPath?: string;
  messages: ImportedProviderMessage[];
  isSubagent?: boolean;
  usage?: ChatUsageStats | null;
}): ParsedProviderSessionLog {
  const providerSessionId = input.providerSessionId ?? input.sourcePath;
  const offsets = input.messages.map((message) => message.sourceOffset);
  const oldestCursorOffset = offsets.length > 0
    ? offsets.reduce((min, offset) => (offset < min ? offset : min), offsets[0])
    : null;
  const newestCursorOffset = offsets.length > 0
    ? offsets.reduce((max, offset) => (offset > max ? offset : max), offsets[0])
    : null;
  return {
    provider: input.provider,
    providerSessionId,
    sourcePath: input.sourcePath,
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    messages: input.messages,
    oldestCursorOffset,
    newestCursorOffset,
    hasMoreBefore: oldestCursorOffset !== null && oldestCursorOffset > 0n,
    isSubagent: input.isSubagent ?? false,
    usage: input.usage ?? null,
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// 모델명 → 컨텍스트 윈도. Claude transcript에는 윈도 크기가 없어 상수 맵을 쓴다.
const CLAUDE_DEFAULT_CONTEXT_WINDOW = 200_000;

function claudeContextWindow(model: string | null): number {
  if (model && /\[1m\]|-1m/.test(model)) {
    return 1_000_000;
  }
  return CLAUDE_DEFAULT_CONTEXT_WINDOW;
}

type ClaudeUsageAccumulator = {
  model: string | null;
  totalInput: number;
  totalCached: number;
  totalOutput: number;
  lastTurn: ChatUsageTotals | null;
  seen: boolean;
};

function accumulateClaudeUsage(acc: ClaudeUsageAccumulator, message: JsonRecord): void {
  const usage = isRecord(message.usage) ? message.usage : null;
  if (!usage) {
    return;
  }
  const input = asFiniteNumber(usage.input_tokens) ?? 0;
  const cacheRead = asFiniteNumber(usage.cache_read_input_tokens) ?? 0;
  const cacheCreation = asFiniteNumber(usage.cache_creation_input_tokens) ?? 0;
  const output = asFiniteNumber(usage.output_tokens) ?? 0;
  const cached = cacheRead + cacheCreation;
  acc.seen = true;
  acc.model = readString(message.model) ?? acc.model;
  acc.totalInput += input;
  acc.totalCached += cached;
  acc.totalOutput += output;
  // 마지막 assistant usage의 input+cache가 현재 컨텍스트 점유의 근사치다.
  acc.lastTurn = {
    totalTokens: input + cached + output,
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
  };
}

function finalizeClaudeUsage(acc: ClaudeUsageAccumulator): ChatUsageStats | null {
  if (!acc.seen) {
    return null;
  }
  return {
    provider: 'claude',
    model: acc.model,
    contextWindow: claudeContextWindow(acc.model),
    total: {
      totalTokens: acc.totalInput + acc.totalCached + acc.totalOutput,
      inputTokens: acc.totalInput,
      cachedInputTokens: acc.totalCached,
      outputTokens: acc.totalOutput,
    },
    lastTurn: acc.lastTurn,
    updatedAt: new Date().toISOString(),
  };
}

export function parseCodexSessionLog(contents: string, options: ParseOptions): ParsedProviderSessionLog {
  let providerSessionId = options.fallbackSessionId;
  let projectPath: string | undefined;
  const messages: ImportedProviderMessage[] = [];

  for (const { line, offset } of splitJsonlWithOffsets(contents)) {
    const record = parseJsonLine(line);
    if (!record) {
      continue;
    }
    const type = readString(record.type);
    const payload = isRecord(record.payload) ? record.payload : {};
    if (type === 'session_meta') {
      providerSessionId = readString(payload.id) ?? providerSessionId;
      projectPath = readString(payload.cwd) ?? projectPath;
      continue;
    }
    if (type !== 'response_item') {
      continue;
    }
    const payloadType = readString(payload.type);
    const role = readString(payload.role);
    if (payloadType !== 'message' || (role !== 'user' && role !== 'assistant')) {
      continue;
    }
    const text = extractContentText(payload.content);
    if (!text) {
      continue;
    }
    const sessionId = providerSessionId ?? options.sourcePath;
    messages.push({
      role,
      text,
      sourceEventKey: buildEventKey(sessionId, offset, payload),
      sourceOffset: offset,
      ...(parseDate(record.timestamp) ? { sourceCreatedAt: parseDate(record.timestamp) } : {}),
    });
  }

  return finalizeParsedLog({
    provider: 'codex',
    providerSessionId,
    sourcePath: options.sourcePath,
    projectPath,
    messages,
  });
}

export function parseClaudeSessionLog(contents: string, options: ParseOptions): ParsedProviderSessionLog {
  let providerSessionId = options.fallbackSessionId;
  let projectPath: string | undefined;
  const messages: ImportedProviderMessage[] = [];
  // Track sidechain vs non-sidechain among message-bearing records so we can
  // classify the whole transcript. A Claude Code subagent (Task tool) transcript
  // is written to a separate `subagents/agent-*.jsonl` file where every record
  // has `isSidechain: true`; a normal top-level session has none.
  let sidechainMessages = 0;
  let mainlineMessages = 0;
  const usageAcc: ClaudeUsageAccumulator = {
    model: null,
    totalInput: 0,
    totalCached: 0,
    totalOutput: 0,
    lastTurn: null,
    seen: false,
  };

  for (const { line, offset } of splitJsonlWithOffsets(contents)) {
    const record = parseJsonLine(line);
    if (!record) {
      continue;
    }
    const type = readString(record.type);
    if (type !== 'user' && type !== 'assistant') {
      continue;
    }
    if (record.isMeta === true) {
      continue;
    }
    providerSessionId = readString(record.sessionId) ?? readString(record.sessionid) ?? providerSessionId;
    projectPath = readString(record.cwd) ?? projectPath;
    const message = isRecord(record.message) ? record.message : record;
    const role = readString(message.role) ?? type;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    if (role === 'assistant' && record.isSidechain !== true) {
      accumulateClaudeUsage(usageAcc, message);
    }
    const text = extractContentText(message.content);
    if (!text) {
      continue;
    }
    if (record.isSidechain === true) {
      sidechainMessages += 1;
    } else {
      mainlineMessages += 1;
    }
    const sessionId = providerSessionId ?? options.sourcePath;
    messages.push({
      role,
      text,
      sourceEventKey: buildEventKey(sessionId, offset, record),
      sourceOffset: offset,
      ...(parseDate(record.timestamp) ? { sourceCreatedAt: parseDate(record.timestamp) } : {}),
    });
  }

  return finalizeParsedLog({
    provider: 'claude',
    providerSessionId,
    sourcePath: options.sourcePath,
    projectPath,
    messages,
    usage: finalizeClaudeUsage(usageAcc),
    // Pure-sidechain transcript => subagent. Mixed/none => treat as a normal
    // session (the import worker also detects subagents by the `/subagents/`
    // path segment, which is authoritative for the separate-file layout).
    isSubagent: sidechainMessages > 0 && mainlineMessages === 0,
  });
}

export function selectTailMessages(messages: ImportedProviderMessage[], turnCount: number): ImportedProviderMessage[] {
  const normalizedTurnCount = Math.max(1, Math.floor(turnCount));
  let userTurns = 0;
  let startIndex = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      userTurns += 1;
      if (userTurns === normalizedTurnCount) {
        startIndex = index;
        break;
      }
    }
  }
  return messages.slice(startIndex);
}
