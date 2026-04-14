import { describe, expect, it, vi } from 'vitest';
import { GeminiMessageQueue } from '../src/runtime/providers/gemini/geminiMessageQueue.js';
import type { GeminiPersistedMessageProjection } from '../src/runtime/providers/gemini/geminiEventBridge.js';
import type { SessionProtocolEnvelope } from '../src/runtime/contracts/sessionProtocol.js';

describe('GeminiMessageQueue', () => {
  it('serializes tool and text projections in enqueue order', async () => {
    const persisted: GeminiPersistedMessageProjection[] = [];
    const queue = new GeminiMessageQueue(
      {
        requestedPath: '/workspace/project',
        model: 'gemini-2.5-pro',
      },
      async (projection) => {
        persisted.push(projection);
        if (persisted.length === 1) {
          await Promise.resolve();
        }
      },
    );

    const envelopes: SessionProtocolEnvelope[] = [
      {
        kind: 'tool-call-end',
        provider: 'gemini',
        source: 'tool',
        sessionId: 'gemini-session-1',
        turnId: 'gemini-session-1',
        toolCallId: 'call-1',
        toolName: 'command_execution',
        stopReason: 'completed',
      },
      {
        kind: 'text',
        provider: 'gemini',
        source: 'assistant',
        sessionId: 'gemini-session-1',
        turnId: 'gemini-session-1',
        text: '완료',
      },
    ];

    await Promise.all([
      queue.enqueueToolAction({
        action: {
          actionType: 'command_execution',
          title: 'Run command',
          callId: 'call-1',
          command: 'pwd',
          output: '/workspace/project',
          additions: 0,
          deletions: 0,
          hasDiffSignal: false,
        },
        execCwd: '/home/ubuntu/project/ARIS',
        threadId: 'gemini-session-1',
        envelopes,
      }),
      queue.enqueueText({
        output: '완료',
        execCwd: '/home/ubuntu/project/ARIS',
        threadId: 'gemini-session-1',
        messageMeta: {
          streamEvent: 'agent_message',
        },
        envelopes,
      }),
    ]);

    await queue.flush();

    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.body).toContain('$ pwd');
    expect(persisted[1]?.body).toBe('완료');
    expect(persisted[0]?.meta.geminiSessionId).toBe('gemini-session-1');
    expect(persisted[1]?.meta.geminiSessionId).toBe('gemini-session-1');
  });

  it('skips empty text projections without breaking the queue', async () => {
    const persist = vi.fn(async (_projection: GeminiPersistedMessageProjection) => {});
    const queue = new GeminiMessageQueue(
      {
        requestedPath: '/workspace/project',
      },
      persist,
    );

    await queue.enqueueText({
      output: '   ',
      execCwd: '/workspace/project',
    });
    await queue.flush();

    expect(persist).not.toHaveBeenCalled();
  });

  it('continues flushing later projections after a persist failure', async () => {
    const persisted: GeminiPersistedMessageProjection[] = [];
    let attempts = 0;
    const persist = vi.fn(async (projection: GeminiPersistedMessageProjection) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('happy runtime error (502): {"error":"TransactionWriteConflict"}');
      }
      persisted.push(projection);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const queue = new GeminiMessageQueue(
      {
        requestedPath: '/workspace/project',
      },
      persist,
    );

    await queue.enqueueToolAction({
      action: {
        actionType: 'command_execution',
        title: 'Run command',
        callId: 'call-1',
        command: 'pwd',
        output: '/workspace/project',
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      },
      execCwd: '/home/ubuntu/project/ARIS',
      threadId: 'gemini-session-1',
    });
    await queue.enqueueText({
      output: '완료',
      execCwd: '/home/ubuntu/project/ARIS',
      threadId: 'gemini-session-1',
      messageMeta: {
        streamEvent: 'agent_message',
      },
    });

    await expect(queue.flush()).resolves.toBeUndefined();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.body).toBe('완료');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('failed to persist gemini queued message'),
    );
    consoleError.mockRestore();
  });
});
