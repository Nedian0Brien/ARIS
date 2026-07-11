import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import { isWorkspaceRunStepEvent, pairChatTurns } from '@/components/project-chat/projectChatSurfaceUtils';

let seq = 0;

function event(input: {
  role?: 'user' | 'terminal';
  kind?: UiEvent['kind'];
  body?: string;
}): UiEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    timestamp: `2026-07-11T00:00:${String(seq).padStart(2, '0')}.000Z`,
    kind: input.kind ?? 'text_reply',
    title: `event ${seq}`,
    body: input.body ?? `body ${seq}`,
    meta: input.role ? { role: input.role } : { role: 'assistant' },
  };
}

describe('pairChatTurns', () => {
  it('pairs each user turn with the last agent text reply before the next user turn', () => {
    const user1 = event({ role: 'user', body: '첫 질문' });
    const reply1a = event({ kind: 'text_reply', body: '중간 답변' });
    const reply1b = event({ kind: 'text_reply', body: '최종 답변' });
    const user2 = event({ role: 'user', body: '둘째 질문' });
    const reply2 = event({ kind: 'text_reply', body: '둘째 답변' });

    const turns = pairChatTurns([user1, reply1a, reply1b, user2, reply2], 10);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ id: user1.id, text: '첫 질문', agentText: '최종 답변', isLatest: false });
    expect(turns[1]).toMatchObject({ id: user2.id, text: '둘째 질문', agentText: '둘째 답변', isLatest: true });
  });

  it('does not use terminal output or work events as the agent reply', () => {
    const user = event({ role: 'user', body: '질문' });
    const work = event({ kind: 'command_execution', body: 'npm test 실행' });
    const terminal = event({ role: 'terminal', kind: 'text_reply', body: '터미널 출력' });

    const turns = pairChatTurns([user, work, terminal], 10);

    expect(turns).toHaveLength(1);
    expect(turns[0].agentText).toBeNull();
  });

  it('marks only the newest turn as latest and applies the limit from the tail', () => {
    const events: UiEvent[] = [];
    for (let index = 0; index < 12; index += 1) {
      events.push(event({ role: 'user', body: `질문 ${index}` }));
      events.push(event({ kind: 'text_reply', body: `답변 ${index}` }));
    }

    const turns = pairChatTurns(events, 10);

    expect(turns).toHaveLength(10);
    expect(turns[0].text).toBe('질문 2');
    expect(turns.filter((turn) => turn.isLatest)).toHaveLength(1);
    expect(turns.at(-1)?.text).toBe('질문 11');
    expect(turns.at(-1)?.isLatest).toBe(true);
  });

  it('ignores agent replies that arrive before any user turn', () => {
    const strayReply = event({ kind: 'text_reply', body: '떠돌이 답변' });
    const user = event({ role: 'user', body: '질문' });

    const turns = pairChatTurns([strayReply, user], 10);

    expect(turns).toHaveLength(1);
    expect(turns[0].agentText).toBeNull();
  });
});

describe('isWorkspaceRunStepEvent', () => {
  it('counts work events and excludes replies and thinking', () => {
    expect(isWorkspaceRunStepEvent(event({ kind: 'command_execution' }))).toBe(true);
    expect(isWorkspaceRunStepEvent(event({ kind: 'file_write' }))).toBe(true);
    expect(isWorkspaceRunStepEvent(event({ kind: 'text_reply' }))).toBe(false);
    expect(isWorkspaceRunStepEvent(event({ kind: 'think' }))).toBe(false);
    expect(isWorkspaceRunStepEvent(event({ kind: 'unknown' }))).toBe(false);
  });
});
