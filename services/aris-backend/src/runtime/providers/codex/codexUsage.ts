import type { ChatUsageStats, ChatUsageTotals } from '../../../types.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseTotals(value: unknown): ChatUsageTotals | null {
  const record = asRecord(value);
  if (!record) return null;
  const totalTokens = asFiniteNumber(record.totalTokens);
  const inputTokens = asFiniteNumber(record.inputTokens);
  const cachedInputTokens = asFiniteNumber(record.cachedInputTokens);
  const outputTokens = asFiniteNumber(record.outputTokens);
  if (totalTokens === null && inputTokens === null && outputTokens === null) {
    return null;
  }
  const reasoning = asFiniteNumber(record.reasoningOutputTokens);
  return {
    totalTokens: totalTokens ?? 0,
    inputTokens: inputTokens ?? 0,
    cachedInputTokens: cachedInputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(reasoning !== null ? { reasoningOutputTokens: reasoning } : {}),
  };
}

/**
 * Codex app-server `thread/tokenUsage/updated` 알림에서 usage를 추출한다.
 * params 형태(실측): { threadId, turnId, tokenUsage: { total: {...}, last: {...},
 * modelContextWindow } } — 런당 ~100회 이상 발행되는 누적치라 마지막 값이 최종이다.
 */
export function extractCodexChatUsage(
  params: JsonRecord,
  model: string | null,
): ChatUsageStats | null {
  const tokenUsage = asRecord(params.tokenUsage);
  if (!tokenUsage) return null;
  const total = parseTotals(tokenUsage.total);
  if (!total) return null;
  return {
    provider: 'codex',
    model,
    contextWindow: asFiniteNumber(tokenUsage.modelContextWindow),
    total,
    lastTurn: parseTotals(tokenUsage.last),
    updatedAt: new Date().toISOString(),
  };
}
