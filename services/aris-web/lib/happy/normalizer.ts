import type { SessionDetail, SessionSummary, UiEvent, UiEventKind } from '@/lib/happy/types';

type RecordValue = Record<string, unknown>;

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

export function classifyEventKind(input: { type?: string; text?: string }): UiEventKind {
  const type = input.type?.toLowerCase() ?? '';
  const text = input.text?.toLowerCase() ?? '';

  if (type.includes('tool') || type.includes('command') || text.includes('$ ') || text.includes('exit code')) {
    return 'command_execution';
  }
  if (type.includes('diff') || type.includes('write') || text.includes('patched') || text.includes('modified')) {
    return 'code_write';
  }
  if (type.includes('read') || text.includes('opened') || text.includes('file:')) {
    return 'code_read';
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
  };
}

export function normalizeEvents(raw: unknown): UiEvent[] {
  const list = Array.isArray(raw) ? raw : [];

  return list.map((item, idx): UiEvent => {
    const rec = asRecord(item);
    const content = asRecord(rec?.content);

    const body = asString(rec?.body ?? rec?.text ?? content?.text ?? content, '');
    const kind = classifyEventKind({
      type: asString(rec?.type ?? content?.type, ''),
      text: body,
    });

    return {
      id: asString(rec?.id ?? rec?.localId, `evt-${idx}`),
      timestamp: asString(rec?.createdAt ?? rec?.timestamp, new Date().toISOString()),
      kind,
      title: asString(rec?.title, kind.replace('_', ' ')),
      body,
      meta: asRecord(rec?.meta) ?? undefined,
      severity: kind === 'command_execution' ? 'warning' : kind === 'code_write' ? 'success' : 'info',
    };
  });
}
