import type { AgentFlavor } from '@/lib/happy/types';

export function extractLastDirectoryName(path: string): string {
  // Normalize backslashes to forward slashes
  const withForwardSlashes = path.replace(/\\/g, '/').trim();
  // Empty input
  if (!withForwardSlashes) return 'workspace';
  // Root path (only slashes)
  if (/^\/+$/.test(withForwardSlashes)) return '/';
  // Strip trailing slashes
  const normalized = withForwardSlashes.replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function resolveAgentFlavor(agent: unknown): AgentFlavor {
  if (agent === 'claude' || agent === 'codex' || agent === 'gemini') {
    return agent;
  }
  return 'unknown';
}
