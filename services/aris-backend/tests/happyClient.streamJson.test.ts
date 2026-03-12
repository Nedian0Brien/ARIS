import { afterEach, describe, expect, it, vi } from 'vitest';
import { happyClientTestHooks } from '../src/runtime/happyClient.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('happyClient stream-json parsing', () => {
  it('marks Claude transcript-only output as non-message while keeping action extraction', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        command: 'ls -la',
        output: 'total 8',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        output: '$ ls -la\nexit code: 0',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toContain('ls -la');
    expect(happyClientTestHooks.looksLikeActionTranscript('$ ls -la\nexit code: 0')).toBe(true);
  });

  it('parses Gemini stream-json sample into both action and assistant message', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        command: 'cat README.md',
        output: '# README',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        output: '$ cat README.md\nexit code: 0',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: 'README 내용을 확인했고 핵심만 요약했습니다.',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.output).toBe('README 내용을 확인했고 핵심만 요약했습니다.');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toContain('cat README.md');
  });

  it('strips plan status metadata from stream-json assistant messages', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: `Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가
status: in_progress

registry/controller를 ClaudeSession 중심으로 재편
status: pending`,
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.output).toBe(`Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가

registry/controller를 ClaudeSession 중심으로 재편`);
  });

  it('extracts tool call ids from stream-json action events', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-123',
        command: 'git status',
        output: 'On branch main',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '현재 상태를 확인했습니다.',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.actions.length).toBe(1);
    expect(parsed.actions[0]?.callId).toBe('call-123');
    expect(parsed.actions[0]?.command).toBe('git status');
  });

  it('parses a single stream-json line into action metadata', () => {
    const line = JSON.stringify({
      type: 'tool',
      subtype: 'command_execution',
      callId: 'call-line-1',
      command: 'ls -la',
      output: 'total 12',
    });

    const parsed = happyClientTestHooks.parseAgentStreamLine(line);
    expect(parsed.action?.actionType).toBe('file_list');
    expect(parsed.action?.callId).toBe('call-line-1');
    expect(parsed.action?.command).toBe('ls -la');
    expect(parsed.actionKey).toContain('call-line-1');
  });

  it('builds session hint meta for text and tool-call events', () => {
    const textMeta = happyClientTestHooks.buildSessionHintMeta({
      eventType: 'text',
    });
    expect((textMeta.sessionEvent as { ev: { t: string } }).ev.t).toBe('text');
    expect(textMeta.sessionEventType).toBe('text');

    const toolMeta = happyClientTestHooks.buildSessionHintMeta({
      eventType: 'tool-call-end',
      callId: 'call-9',
    });
    expect((toolMeta.sessionEvent as { ev: { t: string; call?: string } }).ev.t).toBe('tool-call-end');
    expect((toolMeta.sessionEvent as { ev: { t: string; call?: string } }).ev.call).toBe('call-9');
    expect(toolMeta.sessionCallId).toBe('call-9');
  });

  it('extracts message text from wrapped happy payload content', () => {
    const wrappedPayload = {
      t: 'json',
      c: JSON.stringify({
        role: 'agent',
        title: 'Text Reply',
        text: 'wrapped content from happy',
      }),
    };

    const parsed = happyClientTestHooks.parseMessagePayloadText(wrappedPayload);
    expect(parsed.role).toBe('agent');
    expect(parsed.title).toBe('Text Reply');
    expect(parsed.text).toBe('wrapped content from happy');
  });

  it('falls back to raw payload text when happy payload parsing fails', () => {
    const parsed = happyClientTestHooks.parseMessagePayloadText({
      unknownShape: { foo: 'bar' },
    });
    expect(parsed.text).toContain('[UNPARSED HAPPY PAYLOAD]');
    expect(parsed.text).toContain('"unknownShape"');
  });

  it('skips duplicate agent messages for the same turn only', () => {
    const seen = new Set<string>();

    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'same reply')).toBe(false);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'same reply')).toBe(true);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'different reply')).toBe(false);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-2', 'same reply')).toBe(false);
  });

  it('builds a stable Claude session id per session and chat', () => {
    const first = happyClientTestHooks.buildClaudeSessionId('session-1', 'chat-1');
    const second = happyClientTestHooks.buildClaudeSessionId('session-1', 'chat-1');
    const otherChat = happyClientTestHooks.buildClaudeSessionId('session-1', 'chat-2');

    expect(first).toBe(second);
    expect(otherChat).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('uses --session-id for Claude when the resume id is a UUID', () => {
    const sessionId = happyClientTestHooks.buildClaudeSessionId('session-2', 'chat-2');
    const command = happyClientTestHooks.buildAgentCommand(
      'claude',
      'Reply with OK',
      'on-request',
      'claude-haiku-4-5',
      { id: sessionId, mode: 'session-id' },
    );

    expect(command).not.toBeNull();
    expect(command?.args).toContain('--session-id');
    expect(command?.args).toContain(sessionId);
    expect(command?.args).not.toContain('--resume');
    expect(command?.fallbackArgs).toBeUndefined();
  });

  it('uses --resume for stored Claude session ids', () => {
    const command = happyClientTestHooks.buildAgentCommand(
      'claude',
      'Reply with OK',
      'on-request',
      'claude-haiku-4-5',
      { id: 'session-live-123', mode: 'resume' },
    );

    expect(command).not.toBeNull();
    expect(command?.args).toContain('--resume');
    expect(command?.args).toContain('session-live-123');
    expect(command?.args).not.toContain('--session-id');
    expect(command?.fallbackArgs).toBeUndefined();
  });

  it('extracts Claude session ids from stream-json output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-abc',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '응답 완료',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-abc');
    expect(parsed.output).toBe('응답 완료');
  });

  it('waits for a quiet window after the latest app-server activity', async () => {
    vi.useFakeTimers();

    let activityTick = 0;
    let lastActivityAt = Date.now();
    setTimeout(() => {
      activityTick += 1;
      lastActivityAt = Date.now();
    }, 100);

    const waitPromise = happyClientTestHooks.waitForStableActivity({
      getActivityTick: () => activityTick,
      getLastActivityAt: () => lastActivityAt,
      quietMs: 200,
      timeoutMs: 1_000,
    });

    const settled = vi.fn();
    void waitPromise.then(settled);

    await vi.advanceTimersByTimeAsync(250);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    await waitPromise;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('stops waiting once the drain timeout is reached', async () => {
    vi.useFakeTimers();

    let activityTick = 0;
    let lastActivityAt = Date.now();
    const timer = setInterval(() => {
      activityTick += 1;
      lastActivityAt = Date.now();
    }, 40);

    const waitPromise = happyClientTestHooks.waitForStableActivity({
      getActivityTick: () => activityTick,
      getLastActivityAt: () => lastActivityAt,
      quietMs: 200,
      timeoutMs: 150,
    });

    await vi.advanceTimersByTimeAsync(200);
    await waitPromise;

    clearInterval(timer);
    expect(activityTick).toBeGreaterThan(0);
  });
});
