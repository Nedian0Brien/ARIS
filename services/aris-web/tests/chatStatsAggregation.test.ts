import { describe, expect, it } from 'vitest';
import { buildProjectChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';

describe('buildProjectChatMeta', () => {
  it('집계된 groupBy 행을 세션별 chatAgentCounts Map으로 변환한다', () => {
    const rows = [
      { projectId: 'session-1', agent: 'claude', _count: { id: 3 } },
      { projectId: 'session-1', agent: 'codex', _count: { id: 2 } },
      { projectId: 'session-2', agent: 'gemini', _count: { id: 1 } },
    ];

    const result = buildProjectChatMeta(rows);

    expect(result.get('session-1')).toEqual({ claude: 3, codex: 2, gemini: 0, unknown: 0, total: 5 });
    expect(result.get('session-2')).toEqual({ claude: 0, codex: 0, gemini: 1, unknown: 0, total: 1 });
  });

  it('알 수 없는 agent는 unknown으로 집계한다', () => {
    const rows = [
      { projectId: 'session-1', agent: 'gpt-4', _count: { id: 2 } },
    ];
    const result = buildProjectChatMeta(rows);
    expect(result.get('session-1')).toEqual({ claude: 0, codex: 0, gemini: 0, unknown: 2, total: 2 });
  });

  it('빈 배열이면 빈 Map을 반환한다', () => {
    expect(buildProjectChatMeta([])).toEqual(new Map());
  });
});

describe('buildAgentDistribution', () => {
  it('groupBy 행에서 에이전트 분포 객체를 생성한다', () => {
    const rows = [
      { agent: 'claude', _count: { id: 5 } },
      { agent: 'codex', _count: { id: 3 } },
    ];
    expect(buildAgentDistribution(rows)).toEqual({ claude: 5, codex: 3, gemini: 0, unknown: 0 });
  });

  it('빈 배열이면 모두 0인 객체를 반환한다', () => {
    expect(buildAgentDistribution([])).toEqual({ claude: 0, codex: 0, gemini: 0, unknown: 0 });
  });
});
