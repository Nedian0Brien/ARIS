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

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function isActionKind(kind: UiEventKind): kind is 'run_execution' | 'exec_execution' | 'command_execution' | 'file_list' | 'file_read' | 'file_write' {
  return kind === 'run_execution' || kind === 'exec_execution' || kind === 'command_execution' || kind === 'file_list' || kind === 'file_read' || kind === 'file_write';
}

function toUiEventKind(value: string): UiEventKind | null {
  if (value === 'run_execution' || value === 'exec_execution' || value === 'file_list' || value === 'file_read' || value === 'file_write') {
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
  const fromMeta = toUiEventKind(asString(meta?.actionType, '').toLowerCase());
  if (fromMeta) {
    return fromMeta;
  }
  return toUiEventKind(type);
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

  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+(.+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+(.+)$/i];
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
    if (
      /^(docker\s+exec|docker\s+compose\s+exec|kubectl\s+exec|ssh)\b/.test(withoutEnv)
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

  if (kind === 'command_execution' || kind === 'run_execution' || kind === 'exec_execution' || kind === 'file_list') {
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
  if (kind === 'command_execution' || kind === 'run_execution' || kind === 'exec_execution') {
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

  const kindFromType = pickKindFromMeta(null, type);
  if (
    kindFromType
    && kindFromType !== 'command_execution'
    && kindFromType !== 'run_execution'
    && kindFromType !== 'exec_execution'
  ) {
    return kindFromType;
  }

  const shellKind = classifyShellCommandKind(input.command ?? '');
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
  if (type.includes('diff') || type.includes('write') || text.includes('patched') || text.includes('modified')) {
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

export function normalizeSessions(raw: unknown): SessionSummary[] {
  const list = Array.isArray(raw) ? raw : [];

  return list.map((item, idx): SessionSummary => {
    const rec = asRecord(item);
    const metadata = asRecord(rec?.metadata);
    const state = asRecord(rec?.state);
    const status = asString(state?.status, asString(rec?.status, 'unknown'));

    return {
      id: asString(rec?.id ?? rec?.sessionId, `unknown-${idx}`),
      agent: normalizeAgent(asString(metadata?.flavor ?? rec?.flavor, 'unknown')),
      status: normalizeStatus(status),
      lastActivityAt: asNullableString(rec?.updatedAt ?? rec?.lastActivityAt),
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

  return {
    id: asString(rec?.id ?? rec?.sessionId, 'unknown'),
    agent: normalizeAgent(asString(metadata?.flavor ?? rec?.flavor, 'unknown')),
    status: normalizeStatus(asString(state?.status ?? rec?.status, 'unknown')),
    projectName: asString(metadata?.path ?? rec?.projectName, 'unknown-project'),
    lastActivityAt: asNullableString(rec?.updatedAt ?? rec?.lastActivityAt),
    approvalPolicy: normalizeApprovalPolicy(asString(metadata?.approvalPolicy ?? rec?.approvalPolicy, 'on-request')),
  };
}

export function normalizeEvents(raw: unknown): UiEvent[] {
  const list = Array.isArray(raw) ? raw : [];

  return list.map((item, idx): UiEvent => {
    const rec = asRecord(item);
    const content = asRecord(rec?.content);
    const meta = asRecord(rec?.meta);

    const body = asString(rec?.body ?? rec?.text ?? content?.text ?? content, '');
    const type = asString(rec?.type ?? content?.type, '');
    const firstLine = body.replace(/\r\n/g, '\n').split('\n')[0] ?? '';
    const metaCommand = asString(meta?.command, '').trim();
    const commandCandidate = metaCommand || (firstLine.trim().startsWith('$ ') ? extractCommand(firstLine) : '');
    const kindFromMeta = pickKindFromMeta(meta, type.toLowerCase());
    const kind = classifyEventKind({
      type: kindFromMeta ?? type,
      text: body,
      command: commandCandidate,
    });
    const actionPayload = extractActionAndResult(kind, body, meta);

    return {
      id: asString(rec?.id ?? rec?.localId, `evt-${idx}`),
      timestamp: asString(rec?.createdAt ?? rec?.timestamp, new Date().toISOString()),
      kind,
      title: asString(rec?.title, kind.replace('_', ' ')),
      body,
      meta: meta ?? undefined,
      action: actionPayload.action,
      result: actionPayload.result,
      severity: severityFromKind(kind),
    };
  });
}
