import type { CodexQuotaUsage } from '@/lib/happy/types';

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatCodexQuotaUsage(usage?: CodexQuotaUsage | null): string | null {
  if (!usage) {
    return null;
  }

  const parts: string[] = [];
  if (typeof usage.inputTokens === 'number') {
    parts.push(`입력 ${numberFormatter.format(usage.inputTokens)}`);
  }
  if (typeof usage.cachedInputTokens === 'number') {
    parts.push(`캐시 ${numberFormatter.format(usage.cachedInputTokens)}`);
  }
  if (typeof usage.outputTokens === 'number') {
    parts.push(`출력 ${numberFormatter.format(usage.outputTokens)}`);
  }
  if (typeof usage.totalTokens === 'number') {
    parts.push(`합계 ${numberFormatter.format(usage.totalTokens)}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
