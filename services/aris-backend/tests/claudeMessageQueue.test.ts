import { describe, expect, it, vi } from 'vitest';
import { ClaudeMessageQueue } from '../src/runtime/providers/claude/claudeMessageQueue.js';
import type { PersistedMessageProjection } from '../src/runtime/providers/claude/claudeEventBridge.js';
import type { SessionProtocolEnvelope } from '../src/runtime/contracts/sessionProtocol.js';

describe('ClaudeMessageQueue', () => {
  it('serializes tool and text projections in enqueue order', async () => {
    const persisted: PersistedMessageProjection[] = [];
    const queue = new ClaudeMessageQueue(
      {
        requestedPath: '/workspace/project',
        model: 'claude-sonnet-4-5',
        launchMode: 'remote',
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
        provider: 'claude',
        source: 'tool',
        sessionId: 'claude-session-1',
        turnId: 'claude-session-1',
        toolCallId: 'call-1',
        toolName: 'command_execution',
        stopReason: 'completed',
      },
      {
        kind: 'text',
        provider: 'claude',
        source: 'assistant',
        sessionId: 'claude-session-1',
        turnId: 'claude-session-1',
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
        threadId: 'claude-session-1',
        envelopes,
      }),
      queue.enqueueText({
        output: '완료',
        execCwd: '/home/ubuntu/project/ARIS',
        threadId: 'claude-session-1',
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
    expect(persisted[0]?.meta.launchMode).toBe('remote');
    expect(persisted[1]?.meta.launchMode).toBe('remote');
  });

  it('skips empty text projections without breaking the queue', async () => {
    const persist = vi.fn(async (_projection: PersistedMessageProjection) => {});
    const queue = new ClaudeMessageQueue(
      {
        requestedPath: '/workspace/project',
        launchMode: 'local',
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
    const persisted: PersistedMessageProjection[] = [];
    let attempts = 0;
    const persist = vi.fn(async (projection: PersistedMessageProjection) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('happy runtime error (502): {"error":"TransactionWriteConflict"}');
      }
      persisted.push(projection);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const queue = new ClaudeMessageQueue(
      {
        requestedPath: '/workspace/project',
        launchMode: 'remote',
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
      threadId: 'claude-session-1',
    });
    await queue.enqueueText({
      output: '완료',
      execCwd: '/home/ubuntu/project/ARIS',
      threadId: 'claude-session-1',
      messageMeta: {
        streamEvent: 'agent_message',
      },
    });

    await expect(queue.flush()).resolves.toBeUndefined();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.body).toBe('완료');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('failed to persist claude queued message'),
    );
    consoleError.mockRestore();
  });
});
