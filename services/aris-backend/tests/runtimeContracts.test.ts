import { describe, expect, it } from 'vitest';
import { isSessionProtocolEnvelopeKind, SESSION_PROTOCOL_ENVELOPE_KINDS } from '../src/runtime/contracts/sessionProtocol.js';
import { ClaudeSessionController } from '../src/runtime/providers/claude/claudeSessionController.js';

describe('runtime contracts', () => {
  it('exposes the supported session protocol envelope kinds', () => {
    expect(SESSION_PROTOCOL_ENVELOPE_KINDS).toEqual([
      'assistant_message',
      'tool_action',
      'session_identity',
    ]);
    expect(isSessionProtocolEnvelopeKind('tool_action')).toBe(true);
    expect(isSessionProtocolEnvelopeKind('unknown')).toBe(false);
  });

  it('tracks Claude session controller snapshots through the session lifecycle', async () => {
    const controller = new ClaudeSessionController({
      sessionId: 'session-1',
      chatId: 'chat-1',
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
    });

    expect(controller.snapshot()).toEqual({
      scope: {
        sessionId: 'session-1',
        chatId: 'chat-1',
      },
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
      status: 'running',
    });

    controller.finish();
    await controller.waitForCompletion(10);

    expect(controller.snapshot()).toEqual({
      scope: {
        sessionId: 'session-1',
        chatId: 'chat-1',
      },
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
      status: 'finished',
    });
  });
});
