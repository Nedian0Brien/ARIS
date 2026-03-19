import { describe, expect, it } from 'vitest';
import { filterRealtimeRowsByChat } from '../src/runtime/prismaStore.js';

describe('filterRealtimeRowsByChat', () => {
  it('returns only rows for the requested chat id', () => {
    const rows = [
      { meta: { chatId: 'chat-old' }, seq: 1 },
      { meta: { chatId: 'chat-new' }, seq: 2 },
      { meta: { chatId: 'chat-old' }, seq: 3 },
    ];

    expect(filterRealtimeRowsByChat(rows, 'chat-new')).toEqual([
      { meta: { chatId: 'chat-new' }, seq: 2 },
    ]);
  });

  it('returns all rows when no chat id is requested', () => {
    const rows = [
      { meta: { chatId: 'chat-old' }, seq: 1 },
      { meta: { chatId: 'chat-new' }, seq: 2 },
    ];

    expect(filterRealtimeRowsByChat(rows)).toEqual(rows);
  });
});
