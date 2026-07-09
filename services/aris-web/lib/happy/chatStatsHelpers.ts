import { resolveAgentFlavor } from '@/lib/happy/utils';

type GroupByRow = {
  sessionId?: string;
  projectId?: string;
  agent: string;
  _count: { id: number };
};

type ProjectChatCounts = {
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

export function buildProjectChatMeta(
  rows: GroupByRow[],
): Map<string, ProjectChatCounts> {
  const meta = new Map<string, ProjectChatCounts>();

  for (const row of rows) {
    const key = row.projectId ?? row.sessionId;
    if (!key) continue;
    const entry = meta.get(key) ?? { claude: 0, codex: 0, gemini: 0, unknown: 0, total: 0 };
    const k = resolveAgentFlavor(row.agent);
    entry[k] += row._count.id;
    entry.total += row._count.id;
    meta.set(key, entry);
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
