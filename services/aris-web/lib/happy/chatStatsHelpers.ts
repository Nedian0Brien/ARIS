import { resolveAgentFlavor } from '@/lib/happy/utils';

type GroupByRow = {
  sessionId?: string;
  agent: string;
  _count: { id: number };
};

type SessionChatCounts = {
  claude: number;
  codex: number;
  gemini: number;
  unknown: number;
  total: number;
};

type AgentDistribution = {
  claude: number;
  codex: number;
  gemini: number;
  unknown: number;
};

export function buildSessionChatMeta(
  rows: GroupByRow[],
): Map<string, SessionChatCounts> {
  const meta = new Map<string, SessionChatCounts>();

  for (const row of rows) {
    if (!row.sessionId) continue;
    const entry = meta.get(row.sessionId) ?? { claude: 0, codex: 0, gemini: 0, unknown: 0, total: 0 };
    const k = resolveAgentFlavor(row.agent);
    entry[k] += row._count.id;
    entry.total += row._count.id;
    meta.set(row.sessionId, entry);
  }

  return meta;
}

export function buildAgentDistribution(rows: GroupByRow[]): AgentDistribution {
  const dist: AgentDistribution = { claude: 0, codex: 0, gemini: 0, unknown: 0 };
  for (const row of rows) {
    const k = resolveAgentFlavor(row.agent);
    dist[k] += row._count.id;
  }
  return dist;
}
