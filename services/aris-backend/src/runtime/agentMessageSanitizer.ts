const PLAN_STATUS_VALUES = new Set([
  'pending',
  'queued',
  'in_progress',
  'inprogress',
  'running',
  'completed',
  'done',
  'blocked',
  'cancelled',
  'canceled',
  'not_started',
  'notstarted',
  'todo',
]);

const HIDDEN_TOOL_STATUS_VALUES = new Set([
  'pending',
  'queued',
  'in_progress',
  'inprogress',
  'running',
  'completed',
  'complete',
  'success',
  'succeeded',
  'ok',
  'waiting_for_approval',
]);

function normalizeStatusToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isPlanStatusMetadataLine(line: string): boolean {
  const match = line.trim().match(/^status:\s*([a-z][a-zA-Z_\s-]*)$/);
  if (!match) {
    return false;
  }
  return PLAN_STATUS_VALUES.has(normalizeStatusToken(match[1] ?? ''));
}

export function shouldDisplayToolStatus(status?: string): boolean {
  if (!status) {
    return false;
  }
  return !HIDDEN_TOOL_STATUS_VALUES.has(normalizeStatusToken(status));
}

export function sanitizeAgentMessageText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  const lines = normalized.split('\n');
  let statusLineCount = 0;
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!inCodeFence && isPlanStatusMetadataLine(line)) {
      statusLineCount += 1;
    }
  }

  if (statusLineCount < 2) {
    return normalized;
  }

  const sanitizedLines: string[] = [];
  inCodeFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      sanitizedLines.push(line);
      continue;
    }
    if (!inCodeFence && isPlanStatusMetadataLine(line)) {
      continue;
    }
    sanitizedLines.push(line);
  }

  const sanitized = sanitizedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitized || normalized;
}
