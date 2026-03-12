import { describe, expect, it, vi } from 'vitest';
import { createGeminiRuntime } from '../src/runtime/providers/gemini/geminiRuntime.js';

describe('geminiRuntime', () => {
  it('recovers a stored Gemini thread id as a resume target', async () => {
    const runtime = createGeminiRuntime();

    const recovered = await runtime.recoverSession({
      session: {
        id: 'session-1',
        metadata: {
          flavor: 'gemini',
          path: '/workspace/project',
          approvalPolicy: 'on-request',
        },
      },
      chatId: 'chat-1',
      storedThreadId: 'gemini-thread-123',
    });

    expect(recovered).toEqual({
      session: {
        id: 'session-1',
        metadata: {
          flavor: 'gemini',
          path: '/workspace/project',
          approvalPolicy: 'on-request',
        },
      },
      chatId: 'chat-1',
      recoveredThreadId: 'gemini-thread-123',
      threadIdSource: 'resume',
      source: 'stored',
    });
  });

  it('recovers a Gemini thread id from message history when no stored id exists', async () => {
    const runtime = createGeminiRuntime({
      listMessages: vi.fn().mockResolvedValue([
        {
          id: 'm1',
          sessionId: 'session-1',
          type: 'text',
          title: 'reply',
          text: 'OK',
          createdAt: '2026-03-13T00:00:00.000Z',
          meta: {
            agent: 'gemini',
            chatId: 'chat-1',
            threadId: 'gemini-thread-from-history',
          },
        },
      ]),
    });

    const recovered = await runtime.recoverSession({
      session: {
        id: 'session-1',
        metadata: {
          flavor: 'gemini',
          path: '/workspace/project',
          approvalPolicy: 'on-request',
        },
      },
      chatId: 'chat-1',
    });

    expect(recovered).toMatchObject({
      recoveredThreadId: 'gemini-thread-from-history',
      threadIdSource: 'observed',
      source: 'messages',
    });
  });

  it('tracks observed Gemini thread ids through the provider registry during sendTurn', async () => {
    let resolveTurn: ((value: {
      output: string;
      cwd: string;
      streamedActionsPersisted: boolean;
      inferredActions: [];
      threadId: string;
      threadIdSource: 'observed';
    }) => void) | null = null;
    const runtime = createGeminiRuntime({
      executeTurn: vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveTurn = resolve;
      })),
    });

    const turnPromise = runtime.sendTurn({
      session: {
        id: 'session-1',
        metadata: {
          flavor: 'gemini',
          path: '/workspace/project',
          approvalPolicy: 'on-request',
        },
      },
      chatId: 'chat-1',
      prompt: 'Reply with OK',
    });

    expect(runtime.isRunning({ sessionId: 'session-1', chatId: 'chat-1' })).toBe(true);
    resolveTurn?.({
      output: 'OK',
      cwd: '/workspace/project',
      streamedActionsPersisted: false,
      inferredActions: [],
      threadId: 'gemini-observed-1',
      threadIdSource: 'observed',
    });
    const result = await turnPromise;

    expect(result.threadId).toBe('gemini-observed-1');
    expect(runtime.isRunning({ sessionId: 'session-1', chatId: 'chat-1' })).toBe(false);
  });
});
