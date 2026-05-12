import { describe, expect, it } from 'vitest';
import {
  addPanelToLayout,
  createEmptyParallelWorkspaceLayout,
  normalizeParallelWorkspaceLayout,
  removePanelFromLayout,
  type ParallelPanelRecord,
} from '../lib/parallelWorkspace/layout';

function panel(id: string): ParallelPanelRecord {
  return {
    id,
    sessionId: `session-${id}`,
    title: id,
    rootPath: '/projects/aris',
    worktreePath: `/projects/aris/.worktrees/parallel/${id}`,
    branch: `parallel/${id}`,
    agent: 'codex',
    approvalPolicy: 'on-request',
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
  };
}

describe('parallel workspace layout', () => {
  it('adds panels by splitting the active leaf', () => {
    const first = addPanelToLayout(createEmptyParallelWorkspaceLayout(), panel('one'));
    const second = addPanelToLayout(first, panel('two'));

    expect(second.activePanelId).toBe('two');
    expect(second.layout).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', panelId: 'one' },
      second: { type: 'leaf', panelId: 'two' },
    });
  });

  it('removes orphan panel records during normalization', () => {
    const normalized = normalizeParallelWorkspaceLayout({
      activePanelId: 'missing',
      layout: { type: 'leaf', panelId: 'one' },
      panels: {
        one: panel('one'),
        orphan: panel('orphan'),
      },
    }, '/projects/aris');

    expect(Object.keys(normalized.panels)).toEqual(['one']);
    expect(normalized.activePanelId).toBe('one');
  });

  it('collapses split nodes when a panel is removed', () => {
    const first = addPanelToLayout(createEmptyParallelWorkspaceLayout(), panel('one'));
    const second = addPanelToLayout(first, panel('two'));
    const next = removePanelFromLayout(second, 'two', '/projects/aris');

    expect(next.activePanelId).toBe('one');
    expect(next.layout).toEqual({ type: 'leaf', panelId: 'one' });
    expect(next.panels.two).toBeUndefined();
  });
});
