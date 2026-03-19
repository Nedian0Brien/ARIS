import { describe, expect, it } from 'vitest';
import {
  filterRealtimeRowsByChat,
  resolveChatRunningState,
} from '../src/runtime/prismaStore.js';

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

describe('resolveChatRunningState', () => {
  it('treats the latest user message for the chat as running', () => {
    const rows = [
      { meta: { chatId: 'chat-a', role: 'agent' } },
      { meta: { chatId: 'chat-b', role: 'user' } },
      { meta: { chatId: 'chat-a', role: 'user' } },
    ];

    expect(resolveChatRunningState(rows, 'chat-a')).toBe(true);
  });

  it('treats abort action for the chat as idle', () => {
    const rows = [
      { meta: { chatId: 'chat-a', role: 'user' } },
      { meta: { chatId: 'chat-a', system: true, action: 'abort' } },
    ];

    expect(resolveChatRunningState(rows, 'chat-a')).toBe(false);
  });
});
