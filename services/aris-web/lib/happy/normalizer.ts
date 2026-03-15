import type {
  ApprovalPolicy,
  SessionDetail,
  SessionSummary,
  UiEvent,
  UiEventAction,
  UiEventKind,
  UiEventResult,
} from '@/lib/happy/types';

type RecordValue = Record<string, unknown>;
type Severity = UiEvent['severity'];

const PREVIEW_MAX_LINES = 12;
const PREVIEW_MAX_CHARS = 600;
const RAW_PAYLOAD_MAX_CHARS = 4000;
const UNPARSED_HAPPY_PAYLOAD_PREFIX = '[UNPARSED HAPPY PAYLOAD]';

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RecordValue;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeBase64ToUtf8(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9+/=\n\r]+$/.test(trimmed)) {
    return null;
  }

  try {
    const maybeBuffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
    if (maybeBuffer) {
      const decoded = maybeBuffer.from(trimmed, 'base64').toString('utf8');
      return decoded.length > 0 ? decoded : null;
    }
  } catch {
    // Browser fallback below.
  }

  if (typeof atob !== 'function') {
    return null;
  }

  try {
    const binary = atob(trimmed);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function normalizeWrappedContent(content: unknown): unknown {
  const record = asRecord(content);
  if (record && typeof record.t === 'string' && typeof record.c === 'string') {
    const parsed = parseJson(record.c);
    if (parsed !== null) {
      return parsed;
    }
    const decoded = decodeBase64ToUtf8(record.c);
    if (decoded) {
      const decodedParsed = parseJson(decoded);
      return decodedParsed ?? decoded;
    }
    return record.c;
  }
  return content;
}

function parseTextFromRecord(record: RecordValue | null): string | undefined {
  if (!record) {
    return undefined;
  }

  const directText = asString(record.text, '').trim() || asString(record.body, '').trim();
  if (directText) {
    return directText;
  }

  const nestedCandidates: unknown[] = [
    record.message,
    record.content,
    record.payload,
    record.result,
    record.output,
    record.delta,
    record.data,
    record.payloadMeta,
    record.c,
  ];
  for (const nested of nestedCandidates) {
    const candidate = findTextCandidate(nested);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function findTextCandidate(value: unknown): string | undefined {
  const normalized = normalizeWrappedContent(value);

  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = parseJson(trimmed);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const nested = parseTextFromRecord(asRecord(parsed));
      if (nested) {
        return nested;
      }
    }

    const decoded = decodeBase64ToUtf8(trimmed);
    if (!decoded) {
      return trimmed;
    }
    const decodedParsed = parseJson(decoded);
    if (typeof decodedParsed === 'string') {
      return decodedParsed;
    }
    if (decodedParsed && typeof decodedParsed === 'object') {
      const nested = parseTextFromRecord(asRecord(decodedParsed));
      if (nested) {
        return nested;
      }
    }

    return decoded;
  }

  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      const candidate = findTextCandidate(item);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }

  if (normalized && typeof normalized === 'object') {
    const nested = parseTextFromRecord(asRecord(normalized));
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function stringifyPayloadForDebug(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  try {
    const json = JSON.stringify(value);
    if (!json || json === '{}') {
      return undefined;
    }
    return json.slice(0, RAW_PAYLOAD_MAX_CHARS);
  } catch {
    const fallback = String(value).trim();
    return fallback ? fallback.slice(0, RAW_PAYLOAD_MAX_CHARS) : undefined;
  }
}

function parseHappyMessageContent(content: unknown): {
  type?: string;
  title?: string;
  text?: string;
  meta?: RecordValue;
  fallbackUsed: boolean;
} {
  const normalized = normalizeWrappedContent(content);
  const record = asRecord(normalized);
  const text = findTextCandidate(normalized);

  if (text) {
    return {
      type: asString(record?.type, '').trim() || undefined,
      title: asString(record?.title, '').trim() || undefined,
      text,
      meta: asRecord(record?.meta) ?? asRecord(record?.payloadMeta) ?? asRecord(record?.data) ?? undefined,
      fallbackUsed: false,
    };
  }

  const rawPayload = stringifyPayloadForDebug(normalized ?? content);
  return {
    type: asString(record?.type, '').trim() || undefined,
    title: asString(record?.title, '').trim() || undefined,
    text: rawPayload ? `${UNPARSED_HAPPY_PAYLOAD_PREFIX}\n${rawPayload}` : undefined,
    meta: asRecord(record?.meta) ?? asRecord(record?.payloadMeta) ?? asRecord(record?.data) ?? undefined,
    fallbackUsed: Boolean(rawPayload),
  };
}

function hashFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function resolveEventId(
  rec: RecordValue | null,
  meta: RecordValue | null,
  idx: number,
  input: {
    timestamp: string;
    type: string;
    title: string;
    body: string;
  },
): string {
  const explicitId = asString(rec?.id, '').trim();
  if (explicitId) {
    return explicitId;
  }

  const localId = asString(rec?.localId, '').trim();
  if (localId) {
    return localId;
  }

  const seqCandidates: unknown[] = [
    rec?.seq,
    rec?.messageSeq,
    rec?.eventSeq,
    rec?.index,
    meta?.seq,
    meta?.messageSeq,
    meta?.eventSeq,
  ];
  for (const candidate of seqCandidates) {
    const parsed = asNonNegativeInteger(candidate);
    if (parsed !== null) {
      return `seq-${parsed}`;
    }
  }

  const chatId = asString(meta?.chatId, '').trim();
  const role = asString(meta?.role, '').trim();
  const streamEvent = asString(meta?.streamEvent, '').trim();
  const sessionEventType = readSessionEventType(meta);
  const sessionCallId = readSessionCallId(meta);
  const sessionTurnId = readSessionTurnId(meta);
  const seed = [
    input.timestamp.trim(),
    input.type.trim(),
    input.title.trim(),
    input.body.trim(),
    chatId,
    role,
    streamEvent,
    sessionEventType,
    sessionCallId,
    sessionTurnId,
  ].join('|');
  if (seed.replace(/\|/g, '').length > 0) {
    return `evt-${hashFNV1a(seed)}`;
  }

  return `evt-${idx}`;
}

function isActionKind(kind: UiEventKind): kind is 'run_execution' | 'exec_execution' | 'git_execution' | 'docker_execution' | 'command_execution' | 'file_list' | 'file_read' | 'file_write' | 'think' {
  return kind === 'run_execution'
    || kind === 'exec_execution'
    || kind === 'git_execution'
    || kind === 'docker_execution'
    || kind === 'command_execution'
    || kind === 'file_list'
    || kind === 'file_read'
    || kind === 'file_write'
    || kind === 'think';
}

function toUiEventKind(value: string): UiEventKind | null {
  if (
    value === 'run_execution'
    || value === 'exec_execution'
    || value === 'git_execution'
    || value === 'docker_execution'
    || value === 'file_list'
    || value === 'file_read'
    || value === 'file_write'
  ) {
    return value;
  }
  if (value === 'command_execution') {
    return 'run_execution';
  }
  if (value === 'code_read') {
    return 'file_read';
  }
  if (value === 'code_write') {
    return 'file_write';
  }
  if (value === 'text_reply') {
    return 'text_reply';
  }
  return null;
}

function pickKindFromMeta(meta: RecordValue | null, type: string): UiEventKind | null {
  const fromNormalizedKind = toUiEventKind(asString(meta?.normalizedActionKind, '').toLowerCase());
  if (fromNormalizedKind) {
    return fromNormalizedKind;
  }
  const fromMeta = toUiEventKind(asString(meta?.actionType, '').toLowerCase());
  if (fromMeta) {
    return fromMeta;
  }
  return toUiEventKind(type);
}

function readSessionEventType(meta: RecordValue | null): string {
  const direct = asString(meta?.sessionEventType, '').trim().toLowerCase();
  if (direct) {
    return direct;
  }
  const sessionEvent = asRecord(meta?.sessionEvent);
  const eventRecord = asRecord(sessionEvent?.ev);
  return asString(eventRecord?.t, '').trim().toLowerCase();
}

function readSessionCallId(meta: RecordValue | null): string {
  const direct = asString(meta?.sessionCallId, '').trim();
  if (direct) {
    return direct;
  }
  const sessionEvent = asRecord(meta?.sessionEvent);
  const eventRecord = asRecord(sessionEvent?.ev);
  return asString(eventRecord?.call, '').trim();
}

function readSessionTurnId(meta: RecordValue | null): string {
  const direct = asString(meta?.sessionTurnId, '').trim();
  if (direct) {
    return direct;
  }
  const sessionEvent = asRecord(meta?.sessionEvent);
  return asString(sessionEvent?.turn, '').trim();
}

function classifySessionEventKind(input: {
  sessionEventType: string;
  kindFromMeta: UiEventKind | null;
  commandCandidate: string;
}): UiEventKind | null {
  if (!input.sessionEventType) {
    return null;
  }

  if (
    input.sessionEventType === 'text'
    || input.sessionEventType === 'service'
    || input.sessionEventType === 'turn-start'
    || input.sessionEventType === 'turn-end'
    || input.sessionEventType === 'start'
    || input.sessionEventType === 'stop'
  ) {
    return 'text_reply';
  }

  if (input.sessionEventType === 'tool-call-start' || input.sessionEventType === 'tool-call-end') {
    if (input.kindFromMeta) {
      return input.kindFromMeta;
    }
    const shellKind = classifyShellCommandKind(input.commandCandidate);
    if (shellKind) {
      return shellKind;
    }
    return 'run_execution';
  }

  if (input.sessionEventType === 'file') {
    return input.kindFromMeta ?? 'file_read';
  }

  return null;
}

function extractCommand(line: string): string {
  const cleaned = line.trim();
  if (!cleaned) {
    return '';
  }
  if (cleaned.startsWith('$ ')) {
    return cleaned.slice(2).trim();
  }
  return cleaned;
}

function buildResultPreview(raw: string): UiEventResult | undefined {
  const normalized = raw.replace(/\r\n/g, '\n').trimEnd();
  if (!normalized) {
    return undefined;
  }

  const lines = normalized.split('\n');
  const lineLimited = lines.slice(0, PREVIEW_MAX_LINES).join('\n');
  const charLimited = lineLimited.slice(0, PREVIEW_MAX_CHARS);
  const truncatedByLine = lines.length > PREVIEW_MAX_LINES;
  const truncatedByChar = lineLimited.length > PREVIEW_MAX_CHARS || normalized.length > PREVIEW_MAX_CHARS;
  const truncated = truncatedByLine || truncatedByChar;
  const preview = truncated ? `${charLimited.trimEnd()}\n…` : normalized;

  return {
    preview,
    full: truncated ? normalized : undefined,
    truncated,
    totalLines: lines.length,
    shownLines: Math.min(lines.length, PREVIEW_MAX_LINES),
  };
}

function extractPathFromCommand(command: string): string | undefined {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return undefined;
  }

  const rawLast = tokens[tokens.length - 1];
  const last = rawLast.replace(/^[("'`]+|[)"'`;,]+$/g, '');
  if (last.startsWith('-')) {
    return undefined;
  }
  if (last.includes('/') || last.includes('.') || last.startsWith('~')) {
    return last;
  }
  return undefined;
}

function unwrapShellCommand(raw: string): string {
  let current = raw.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }

  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+([\s\S]+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+([\s\S]+)$/i];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) {
      continue;
    }
    const inner = match[1]?.trim() ?? '';
    if (
      (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
    ) {
      current = inner.slice(1, -1).trim();
    } else {
      current = inner;
    }
  }

  return current;
}

function classifyShellCommandKind(commandInput: string): UiEventKind | null {
  const unwrapped = unwrapShellCommand(commandInput);
  if (!unwrapped) {
    return null;
  }

  const segments = unwrapped
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  let seenRead = false;
  let seenList = false;

  const classifyExecOrRun = (segment: string): UiEventKind | null => {
    const normalized = segment.trim().replace(/^\$\s+/, '').trim();
    if (!normalized) {
      return null;
    }

    const withoutEnv = normalized.replace(/^([a-z_][a-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/i, '').trim();
    if (/^git\b/.test(withoutEnv)) {
      return 'git_execution';
    }
    if (/^(docker\b|docker-compose\b)/.test(withoutEnv)) {
      return 'docker_execution';
    }
    if (
      /^(kubectl\s+exec|ssh)\b/.test(withoutEnv)
    ) {
      return 'exec_execution';
    }

    return 'run_execution';
  };

  const isDangerousSegment = (segment: string): boolean => (
    /\b(rm|mv|cp|chmod|chown|mkdir|touch|truncate|tee|dd|install)\b/.test(segment)
    || /\bsed\b(?!\s+-n\b)/.test(segment)
    || /\bapply_patch\b/.test(segment)
  );

  for (const rawSegment of segments) {
    const segment = rawSegment.toLowerCase();
    if (!segment || /^cd\s+/.test(segment)) {
      continue;
    }
    if (isDangerousSegment(segment)) {
      return null;
    }

    if (
      /^(ls|find|tree)\b/.test(segment)
      || /^rg\s+--files\b/.test(segment)
      || /^fd\b/.test(segment)
    ) {
      seenList = true;
      continue;
    }

    if (
      /^(cat|head|tail|less|more|grep|rg|awk|cut|sort|uniq|wc|stat)\b/.test(segment)
      || /^sed\s+-n\b/.test(segment)
    ) {
      seenRead = true;
      continue;
    }
    return classifyExecOrRun(segment);
  }

  if (seenRead) {
    return 'file_read';
  }
  if (seenList) {
    return 'file_list';
  }
  return classifyExecOrRun(unwrapped);
}

function stripQuotedSegments(input: string): string {
  let result = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      result += quote ? ' ' : char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      result += quote ? ' ' : char;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      result += ' ';
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char as "'" | '"' | '`';
      result += ' ';
      continue;
    }

    result += char;
  }

  return result;
}

function trimBoundaryQuotes(input: string): string {
  let result = input.trim();
  if (!result) {
    return result;
  }

  const hasScriptLikeShape = /[\n;&|]/.test(result);
  while (result.length > 1) {
    const first = result[0];
    if (first !== '\'' && first !== '"' && first !== '`') {
      break;
    }
    if (result.endsWith(first)) {
      result = result.slice(1, -1).trim();
      continue;
    }
    if (hasScriptLikeShape) {
      result = result.slice(1).trim();
      continue;
    }
    break;
  }

  while (result.length > 1) {
    const last = result[result.length - 1];
    if (last !== '\'' && last !== '"' && last !== '`') {
      break;
    }
    if (result.startsWith(last)) {
      result = result.slice(1, -1).trim();
      continue;
    }
    if (hasScriptLikeShape) {
      result = result.slice(0, -1).trim();
      continue;
    }
    break;
  }

  return result;
}

function hasWriteShellIntent(commandInput: string): boolean {
  const unwrapped = unwrapShellCommand(commandInput).toLowerCase();
  if (!unwrapped) {
    return false;
  }
  const unquoted = stripQuotedSegments(unwrapped);
  const relaxed = stripQuotedSegments(trimBoundaryQuotes(unwrapped));

  return (
    /\bapply_patch\b/.test(unquoted)
    || /\btee\b/.test(unquoted)
    || /\bsed\s+-i\b/.test(unquoted)
    || /\bperl\s+-pi\b/.test(unquoted)
    || /\bmkdir\b/.test(unquoted)
    || /\btouch\b/.test(unquoted)
    || /\bmv\b/.test(unquoted)
    || /\bcp\b/.test(unquoted)
    || /\brm\b/.test(unquoted)
    || /\bchmod\b/.test(unquoted)
    || /\bchown\b/.test(unquoted)
    || /\btruncate\b/.test(unquoted)
    || /\binstall\b/.test(unquoted)
    || /\bcat\b[\s\S]*>>?/.test(unquoted)
    || /\b(?:echo|printf)\b[\s\S]*>>?/.test(unquoted)
    || /(?:^|[\s;|&()])(?:\d+)?>>?\s*(?=\S)/.test(unquoted)
    || /\bapply_patch\b/.test(relaxed)
    || /\btee\b/.test(relaxed)
    || /\bsed\s+-i\b/.test(relaxed)
    || /\bperl\s+-pi\b/.test(relaxed)
    || /\bmkdir\b/.test(relaxed)
    || /\btouch\b/.test(relaxed)
    || /\bmv\b/.test(relaxed)
    || /\bcp\b/.test(relaxed)
    || /\brm\b/.test(relaxed)
    || /\bchmod\b/.test(relaxed)
    || /\bchown\b/.test(relaxed)
    || /\btruncate\b/.test(relaxed)
    || /\binstall\b/.test(relaxed)
    || /\bcat\b[\s\S]*>>?/.test(relaxed)
    || /\b(?:echo|printf)\b[\s\S]*>>?/.test(relaxed)
    || /(?:^|[\s;|&()])(?:\d+)?>>?\s*(?=\S)/.test(relaxed)
  );
}

function extractActionAndResult(
  kind: UiEventKind,
  body: string,
  meta: RecordValue | null,
): { action?: UiEventAction; result?: UiEventResult } {
  if (!isActionKind(kind)) {
    return {};
  }

  const safeBody = body.replace(/\r\n/g, '\n');
  const [firstLine = '', ...restLines] = safeBody.split('\n');
  const metaCommand = asString(meta?.command, '').trim();
  const metaPath = asString(meta?.path, '').trim();
  const command = extractCommand(metaCommand || firstLine);
  const outputFromBody = restLines.join('\n').trim();

  if (kind === 'command_execution' || kind === 'run_execution' || kind === 'exec_execution' || kind === 'git_execution' || kind === 'docker_execution' || kind === 'file_list') {
    const resultText = outputFromBody || safeBody.trim();
    return {
      action: {
        command: command || undefined,
        target: metaPath || extractPathFromCommand(command) || undefined,
      },
      result: buildResultPreview(resultText),
    };
  }

  if (kind === 'file_read' || kind === 'file_write') {
    const path = metaPath || extractPathFromCommand(command) || firstLine.trim();
    const codePayload = outputFromBody || safeBody.trim();
    return {
      action: { path: path || undefined },
      result: buildResultPreview(codePayload),
    };
  }

  return {};
}

function severityFromKind(kind: UiEventKind): Severity {
  if (kind === 'command_execution' || kind === 'run_execution' || kind === 'exec_execution' || kind === 'git_execution' || kind === 'docker_execution') {
    return 'warning';
  }
  if (kind === 'file_write') {
    return 'success';
  }
  if (kind === 'unknown') {
    return 'danger';
  }
  return 'info';
}

function normalizeAgent(flavor?: string): SessionSummary['agent'] {
  if (flavor === 'claude' || flavor === 'codex' || flavor === 'gemini') {
    return flavor;
  }
  return 'unknown';
}

function normalizeStatus(value?: string): SessionSummary['status'] {
  if (value === 'running' || value === 'idle' || value === 'stopped' || value === 'error') {
    return value;
  }
  return 'unknown';
}

function normalizeApprovalPolicy(value?: string): ApprovalPolicy {
  if (value === 'on-request' || value === 'on-failure' || value === 'never' || value === 'yolo') {
    return value;
  }
  return 'on-request';
}

export function classifyEventKind(input: { type?: string; text?: string; command?: string }): UiEventKind {
  const type = input.type?.toLowerCase() ?? '';
  const text = input.text?.toLowerCase() ?? '';
  const command = input.command ?? '';
  const trimmedText = input.text?.trim() ?? '';
  const hasActionishTextSignals = (
    text.includes('$ ')
    || text.includes('exit code')
    || text.includes('directory listing')
    || text.includes('rg --files')
    || text.includes('tree ')
    || text.includes('opened')
    || text.includes('file:')
    || text.includes('patched')
    || text.includes('modified')
    || text.includes('apply_patch')
    || text.includes('file_change')
    || text.includes('filechange')
    || text.includes('diff --git')
    || text.includes('*** update file:')
    || text.includes('*** add file:')
    || text.includes('*** delete file:')
  );

  // Guardrail: natural-language status messages should remain text replies
  // even if upstream type metadata is noisy.
  if (
    command.trim().length === 0
    && trimmedText.length > 0
    && !hasActionishTextSignals
    && !type.includes('diff')
    && !type.includes('read')
    && !type.includes('write')
    && !type.includes('list')
  ) {
    return 'text_reply';
  }

  const kindFromType = pickKindFromMeta(null, type);
  const isActionContext = (
    command.trim().length > 0
    || kindFromType === 'file_read'
    || kindFromType === 'file_list'
    || kindFromType === 'file_write'
    || kindFromType === 'command_execution'
    || kindFromType === 'run_execution'
    || kindFromType === 'exec_execution'
    || type.includes('tool')
    || type.includes('command')
    || text.includes('$ ')
    || text.includes('exit code')
  );
  if (
    isActionContext
    && hasWriteShellIntent(command)
  ) {
    return 'file_write';
  }
  if (
    kindFromType
    && kindFromType !== 'command_execution'
    && kindFromType !== 'run_execution'
    && kindFromType !== 'exec_execution'
  ) {
    return kindFromType;
  }

  const shellKind = classifyShellCommandKind(command);
  if (shellKind) {
    return shellKind;
  }

  if (
    type.includes('list') ||
    text.includes('directory listing') ||
    text.includes('$ ls ') ||
    text.includes('$ find ') ||
    text.includes('rg --files') ||
    text.includes('tree ')
  ) {
    return 'file_list';
  }
  if (type.includes('diff') || type.includes('write')) {
    return 'file_write';
  }
  if (
    isActionContext
    && (
      text.includes('patched')
      || text.includes('modified')
      || text.includes('apply_patch')
      || text.includes('file_change')
      || text.includes('filechange')
    )
  ) {
    return 'file_write';
  }
  if (type.includes('read') || text.includes('opened') || text.includes('file:')) {
    return 'file_read';
  }
  if (kindFromType === 'exec_execution') {
    return 'exec_execution';
  }
  if (kindFromType === 'run_execution' || kindFromType === 'command_execution' || type.includes('tool') || type.includes('command') || text.includes('$ ') || text.includes('exit code')) {
    return 'run_execution';
  }
  if (type.includes('text') || type.includes('message')) {
    return 'text_reply';
  }
  if (text.length > 0) {
    return 'text_reply';
  }
  return 'unknown';
}

function extractShellCommandFromBody(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('$ ')) {
      continue;
    }
    const command = extractCommand(trimmed);
    if (command) {
      return command;
    }
  }

  const fenceMatch = normalized.match(/```(?:bash|sh|shell|zsh)?\n([\s\S]*?)```/i);
  if (!fenceMatch || typeof fenceMatch[1] !== 'string') {
    return '';
  }
  const commandLine = fenceMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  return commandLine ? extractCommand(commandLine) : '';
}

function extractPathFromBody(body: string): string {
  const backtickPathMatch = body.match(/`((?:\.{1,2}\/)?[^\s`]*[\\/][^\s`]+|(?:\.{1,2}\/)?[^\s`]+\.[a-z0-9]{1,12})`/i);
  if (backtickPathMatch?.[1]) {
    return backtickPathMatch[1].trim();
  }

  const rawPathMatch = body.match(/(?:^|[\s"'(])((?:\.{1,2}\/)?[a-z0-9._-]+(?:[\\/][a-z0-9._-]+)+\.[a-z0-9]{1,12})(?:$|[\s"'.,)])?/i);
  if (rawPathMatch?.[1]) {
    return rawPathMatch[1].trim();
  }

  return '';
}

function inferCliAgentActionKind(input: {
  type: string;
  text: string;
  meta: RecordValue | null;
}): UiEventKind | null {
  const source = asString(input.meta?.source, '').trim().toLowerCase();
  const agent = asString(input.meta?.agent, '').trim().toLowerCase();
  const streamEvent = asString(input.meta?.streamEvent, '').trim().toLowerCase();
  const sessionEventType = readSessionEventType(input.meta);
  const actionType = asString(input.meta?.actionType, '').trim();
  if (!input.type.includes('message')) {
    return null;
  }
  if (source !== 'cli-agent') {
    return null;
  }
  if (agent !== 'claude' && agent !== 'gemini') {
    return null;
  }
  if (streamEvent || actionType) {
    return null;
  }
  if (sessionEventType) {
    return null;
  }

  const text = input.text.replace(/\r\n/g, '\n');
  const lower = text.toLowerCase();
  const command = extractShellCommandFromBody(text);
  const hasPathPrefix = /(^|\n)\s*path:\s+\S+/i.test(text);
  const hasExitCode = /(^|\n)\s*exit code:\s*-?\d+/i.test(text);
  const hasStrongActionSignal = Boolean(command) || hasPathPrefix || hasExitCode;
  if (!hasStrongActionSignal) {
    return null;
  }

  if (
    lower.includes('diff --git')
    || lower.includes('*** update file:')
    || lower.includes('*** add file:')
    || lower.includes('*** delete file:')
    || lower.includes('@@ ')
  ) {
    return 'file_write';
  }

  if (command) {
    const shellKind = classifyShellCommandKind(command);
    if (shellKind) {
      return shellKind;
    }
  }

  return null;
}

export function normalizeSessions(raw: unknown): SessionSummary[] {
  const list = Array.isArray(raw) ? raw : [];

  return list.map((item, idx): SessionSummary => {
    const rec = asRecord(item);
    const metadata = asRecord(rec?.metadata);
    const state = asRecord(rec?.state);
    const status = asString(state?.status, asString(rec?.status, 'unknown'));
    const model = asNullableString(metadata?.model ?? rec?.model);

    return {
      id: asString(rec?.id ?? rec?.sessionId, `unknown-${idx}`),
      agent: normalizeAgent(asString(metadata?.flavor ?? rec?.flavor, 'unknown')),
      status: normalizeStatus(status),
      lastActivityAt: asNullableString(rec?.updatedAt ?? rec?.lastActivityAt),
      ...(model ? { model } : {}),
      riskScore: asNumber(rec?.riskScore, status === 'error' ? 90 : 20),
      projectName: asString(metadata?.path ?? rec?.projectName, 'unknown-project'),
      approvalPolicy: normalizeApprovalPolicy(asString(metadata?.approvalPolicy ?? rec?.approvalPolicy, 'on-request')),
    };
  });
}

export function normalizeSessionDetail(raw: unknown): SessionDetail {
  const rec = asRecord(raw);
  const metadata = asRecord(rec?.metadata);
  const state = asRecord(rec?.state);
  const model = asNullableString(metadata?.model ?? rec?.model);

  return {
    id: asString(rec?.id ?? rec?.sessionId, 'unknown'),
    agent: normalizeAgent(asString(metadata?.flavor ?? rec?.flavor, 'unknown')),
    status: normalizeStatus(asString(state?.status ?? rec?.status, 'unknown')),
    projectName: asString(metadata?.path ?? rec?.projectName, 'unknown-project'),
    ...(model ? { model } : {}),
    lastActivityAt: asNullableString(rec?.updatedAt ?? rec?.lastActivityAt),
    approvalPolicy: normalizeApprovalPolicy(asString(metadata?.approvalPolicy ?? rec?.approvalPolicy, 'on-request')),
  };
}

export function normalizeEvents(raw: unknown): UiEvent[] {
  const list = Array.isArray(raw) ? raw : [];

  return list.map((item, idx): UiEvent => {
    const rec = asRecord(item);
    const parsedContent = parseHappyMessageContent(rec?.content);
    const baseMeta = asRecord(rec?.meta) ?? parsedContent.meta ?? null;
    const meta = parsedContent.fallbackUsed
      ? { ...(baseMeta ?? {}), parseFallback: true }
      : baseMeta;
    const streamEvent = asString(meta?.streamEvent, '').toLowerCase();
    const sessionEventType = readSessionEventType(meta);

    const body = asString(rec?.body ?? rec?.text ?? parsedContent.text, '');
    const type = asString(rec?.type ?? parsedContent.type, '');
    const timestamp = asString(rec?.createdAt ?? rec?.timestamp, new Date().toISOString());
    const title = asString(rec?.title ?? parsedContent.title, '');
    const resolvedId = resolveEventId(rec, meta, idx, {
      timestamp,
      type,
      title,
      body,
    });
    const firstLine = body.replace(/\r\n/g, '\n').split('\n')[0] ?? '';
    const metaCommand = asString(meta?.command, '').trim();
    const commandCandidate = metaCommand || (firstLine.trim().startsWith('$ ') ? extractCommand(firstLine) : '');
    const kindFromMeta = pickKindFromMeta(meta, type.toLowerCase());
    const kindFromSessionEvent = classifySessionEventKind({
      sessionEventType,
      kindFromMeta,
      commandCandidate,
    });
    const classifiedKind = streamEvent === 'agent_message' || streamEvent === 'agent_message_recovered'
      ? 'text_reply'
      : kindFromSessionEvent
        ? kindFromSessionEvent
      : classifyEventKind({
        type: kindFromMeta ?? type,
        text: body,
        command: commandCandidate,
      });
    const inferredKind = classifiedKind === 'text_reply'
      ? inferCliAgentActionKind({
        type: type.toLowerCase(),
        text: body,
        meta,
      })
      : null;
    const kind = inferredKind ?? classifiedKind;
    const inferredCommand = commandCandidate || extractShellCommandFromBody(body);
    const inferredPath = asString(meta?.path, '').trim() || extractPathFromBody(body);
    const actionMeta = (
      kind !== classifiedKind
      && meta
      && (inferredCommand || inferredPath)
    )
      ? {
        ...meta,
        ...(inferredCommand ? { command: inferredCommand } : {}),
        ...(inferredPath ? { path: inferredPath } : {}),
      }
      : meta;
    const actionPayload = extractActionAndResult(kind, body, actionMeta);

    return {
      id: resolvedId,
      timestamp,
      kind,
      title: title || kind.replace('_', ' '),
      body,
      meta: meta ?? undefined,
      action: actionPayload.action,
      result: actionPayload.result,
      severity: severityFromKind(kind),
    };
  });
}
