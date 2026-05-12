import { describe, expect, it } from 'vitest';
import {
  applyProjectChatDropToPanel,
  collectProjectPanelIds,
  computeProjectPanelDropEdge,
  createProjectPanelTree,
  moveProjectPanelNode,
  resizeProjectPanelSplit,
  type ProjectParallelPanelTreeState,
} from '../app/projectParallelPanels';

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `panel-${index}`;
}

describe('project parallel panel tree', () => {
  it('maps cursor position to edge and center drop zones', () => {
    const rect = { left: 100, top: 50, width: 400, height: 300 };

    expect(computeProjectPanelDropEdge(140, 180, rect)).toBe('left');
    expect(computeProjectPanelDropEdge(470, 180, rect)).toBe('right');
    expect(computeProjectPanelDropEdge(300, 80, rect)).toBe('top');
    expect(computeProjectPanelDropEdge(300, 330, rect)).toBe('bottom');
    expect(computeProjectPanelDropEdge(300, 200, rect)).toBe('center');
  });

  it('splits leaf panels recursively when chats are dropped on edges', () => {
    const createId = idFactory('a', 'b', 'c');
    const initial = createProjectPanelTree('chat-a', createId);
    const twoPane = applyProjectChatDropToPanel(initial, 'a', 'chat-b', 'right', createId);
    const nested = twoPane
      ? applyProjectChatDropToPanel(twoPane, 'b', 'chat-c', 'bottom', createId)
      : null;

    expect(nested).not.toBeNull();
    expect(nested?.layout).toEqual({
      type: 'hsplit',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        {
          type: 'vsplit',
          ratio: 0.5,
          children: [
            { type: 'leaf', panelId: 'b' },
            { type: 'leaf', panelId: 'c' },
          ],
        },
      ],
    });
    expect(collectProjectPanelIds(nested?.layout ?? initial.layout)).toEqual(['a', 'b', 'c']);
  });

  it('replaces a target panel on center drop without duplicating an existing chat', () => {
    const createId = idFactory('a', 'b', 'c');
    const initial = createProjectPanelTree('chat-a', createId);
    const twoPane = applyProjectChatDropToPanel(initial, 'a', 'chat-b', 'right', createId);
    const replaced = twoPane
      ? applyProjectChatDropToPanel(twoPane, 'a', 'chat-b', 'center', createId)
      : null;

    expect(replaced).not.toBeNull();
    expect(replaced?.panels).toEqual({
      a: { id: 'a', chatId: 'chat-b' },
    });
    expect(replaced?.layout).toEqual({ type: 'leaf', panelId: 'a' });
  });

  it('moves existing panel nodes to a target edge', () => {
    const createId = idFactory('a', 'b', 'c');
    const initial = createProjectPanelTree('chat-a', createId);
    const twoPane = applyProjectChatDropToPanel(initial, 'a', 'chat-b', 'right', createId);
    const threePane = twoPane
      ? applyProjectChatDropToPanel(twoPane, 'b', 'chat-c', 'bottom', createId)
      : null;
    const moved = threePane ? moveProjectPanelNode(threePane, 'c', 'a', 'left') : null;

    expect(moved).not.toBeNull();
    expect(moved?.layout).toEqual({
      type: 'hsplit',
      ratio: 0.5,
      children: [
        {
          type: 'hsplit',
          ratio: 0.5,
          children: [
            { type: 'leaf', panelId: 'c' },
            { type: 'leaf', panelId: 'a' },
          ],
        },
        { type: 'leaf', panelId: 'b' },
      ],
    });
    expect(moved?.activePanelId).toBe('c');
  });

  it('resizes nested splits by anchored leaf pair and clamps the ratio', () => {
    const state: ProjectParallelPanelTreeState = {
      activePanelId: 'a',
      panels: {
        a: { id: 'a', chatId: 'chat-a' },
        b: { id: 'b', chatId: 'chat-b' },
      },
      layout: {
        type: 'hsplit',
        ratio: 0.5,
        children: [
          { type: 'leaf', panelId: 'a' },
          { type: 'leaf', panelId: 'b' },
        ],
      },
    };

    expect(resizeProjectPanelSplit(state, 'a', 'b', 0.9).layout).toEqual({
      type: 'hsplit',
      ratio: 0.85,
      children: [
        { type: 'leaf', panelId: 'a' },
        { type: 'leaf', panelId: 'b' },
      ],
    });
  });
});
