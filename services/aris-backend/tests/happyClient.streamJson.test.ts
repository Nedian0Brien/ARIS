import { afterEach, describe, expect, it, vi } from 'vitest';
import { HappyRuntimeStore, happyClientTestHooks } from '../src/runtime/happyClient.js';
import { parseGeminiStreamLine } from '../src/runtime/providers/gemini/geminiProtocolMapper.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it('emits Gemini streamed text for commentary and final Gemini text envelopes', () => {
    const commentaryLine = JSON.stringify({
      method: 'item/completed',
      params: {
        item: {
          type: 'agentMessage',
          id: 'msg-commentary',
          text: '먼저 코드를 살펴보겠습니다.',
          phase: 'commentary',
        },
        threadId: 'gemini-thread',
        turnId: 'turn-1',
      },
    });
    const finalLine = JSON.stringify({
      method: 'item/completed',
      params: {
        item: {
          type: 'agentMessage',
          id: 'msg-final',
          text: '최종 답변입니다.',
          phase: 'final_answer',
        },
        threadId: 'gemini-thread',
        turnId: 'turn-1',
      },
    });

    expect(happyClientTestHooks.extractGeminiStreamTextEvent(parseGeminiStreamLine(commentaryLine))).toMatchObject({
      text: '먼저 코드를 살펴보겠습니다.',
      source: 'assistant',
      threadId: 'gemini-thread',
      turnId: 'turn-1',
      itemId: 'msg-commentary',
    });
    expect(happyClientTestHooks.extractGeminiStreamTextEvent(parseGeminiStreamLine(finalLine))).toMatchObject({
      text: '최종 답변입니다.',
      source: 'assistant',
      threadId: 'gemini-thread',
    });
  });

  it('emits Gemini delta text as partial realtime events', () => {
    const deltaLine = JSON.stringify({
      method: 'codex/event/agent_message_content_delta',
      params: {
        id: 'turn-42',
        conversationId: 'gemini-thread',
        msg: {
          type: 'agent_message_content_delta',
          thread_id: 'gemini-thread',
          turn_id: 'turn-42',
          item_id: 'msg-42',
          delta: '실시간 ',
          phase: 'final_answer',
        },
      },
    });

    expect(happyClientTestHooks.extractGeminiStreamTextEvent(parseGeminiStreamLine(deltaLine))).toMatchObject({
      text: '실시간 ',
      source: 'assistant',
      threadId: 'gemini-thread',
      turnId: 'turn-42',
      itemId: 'msg-42',
      partial: true,
    });
  });

  it('emits Gemini item/agentMessage/delta text as partial realtime events', () => {
    const deltaLine = JSON.stringify({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'gemini-thread',
        turnId: 'turn-43',
        itemId: 'msg-43',
        delta: '중간 코멘터리 ',
      },
    });

    expect(happyClientTestHooks.extractGeminiStreamTextEvent(parseGeminiStreamLine(deltaLine))).toMatchObject({
      text: '중간 코멘터리 ',
      source: 'assistant',
      threadId: 'gemini-thread',
      turnId: 'turn-43',
      itemId: 'msg-43',
      partial: true,
    });
  });

  it('skips Gemini final fallback persistence when the same text was already streamed', () => {
    expect(happyClientTestHooks.shouldPersistFinalAgentOutput({
      flavor: 'gemini',
      streamedPersisted: false,
      agentMessagePersisted: true,
      finalAgentOutput: '최종 답변',
    })).toBe(false);

    expect(happyClientTestHooks.shouldPersistFinalAgentOutput({
      flavor: 'gemini',
      streamedPersisted: false,
      agentMessagePersisted: false,
      finalAgentOutput: '최종 답변',
    })).toBe(true);
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

  it('treats workspace-root Claude paths as remote launch mode when host mapping exists', () => {
    const launchMode = happyClientTestHooks.resolveClaudeLaunchMode({
      sessionPath: '/workspace/ARIS',
      workspaceRoot: '/workspace',
      hostProjectsRoot: '/home/ubuntu/project',
    });

    expect(launchMode).toBe('remote');
  });

  it('keeps Claude launch mode local when no host mapping is configured', () => {
    const launchMode = happyClientTestHooks.resolveClaudeLaunchMode({
      sessionPath: '/workspace/ARIS',
      workspaceRoot: '/workspace',
      hostProjectsRoot: '',
    });

    expect(launchMode).toBe('local');
  });

  it('uses a longer timeout budget for Claude turns than generic CLI agents', () => {
    expect(happyClientTestHooks.resolveAgentCommandTimeoutMs('claude')).toBeGreaterThan(
      happyClientTestHooks.resolveAgentCommandTimeoutMs('gemini'),
    );
  });

  it('uses a longer timeout budget for Gemini turns than generic CLI agents', () => {
    expect(happyClientTestHooks.resolveAgentCommandTimeoutMs('gemini')).toBeGreaterThan(
      happyClientTestHooks.resolveAgentCommandTimeoutMs('unknown'),
    );
  });

  it('enables Gemini stream backend v2 by default and supports explicit rollback values', () => {
    expect(happyClientTestHooks.resolveGeminiStreamBackendV2Enabled()).toBe(true);
    expect(happyClientTestHooks.resolveGeminiStreamBackendV2Enabled('1')).toBe(true);
    expect(happyClientTestHooks.resolveGeminiStreamBackendV2Enabled('false')).toBe(false);
    expect(happyClientTestHooks.resolveGeminiStreamBackendV2Enabled('off')).toBe(false);
    expect(happyClientTestHooks.resolveGeminiStreamBackendV2Enabled('0')).toBe(false);
  });

  it('does not inject --session-id for Claude when given a synthetic target', () => {
    const sessionId = happyClientTestHooks.buildClaudeSessionId('session-2', 'chat-2');
    const command = happyClientTestHooks.buildAgentCommand(
      'claude',
      'Reply with OK',
      'on-request',
      'claude-haiku-4-5',
      { id: sessionId, mode: 'session-id' },
    );

    expect(command).not.toBeNull();
    expect(command?.args).not.toContain('--session-id');
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

  it('extracts generic session ids from stream-json output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        sessionId: 'stream-session-abc',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '응답 완료',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('stream-session-abc');
    expect(parsed.output).toBe('응답 완료');
  });

  it('accepts Gemini session id key variations in generic stream-json parsing', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        session_id: 'gemini-session-snake',
      }),
      JSON.stringify({
        type: 'system',
        sessionid: 'gemini-session-lower',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: 'Gemini 응답 완료',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('gemini-session-lower');
    expect(parsed.output).toBe('Gemini 응답 완료');
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

  it('truncates oversized persisted app-server messages before posting them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = new HappyRuntimeStore({
      serverUrl: 'http://runtime.test',
      token: 'token',
      workspaceRoot: '/workspace',
    }) as unknown as {
      appendAgentMessage: (
        sessionId: string,
        text: string,
        meta?: Record<string, unknown>,
        options?: { type?: string; title?: string },
      ) => Promise<void>;
    };

    await store.appendAgentMessage('session-1', 'x'.repeat(200_000), { streamEvent: 'command_execution' }, {
      type: 'tool',
      title: 'Command Execution',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body)) as {
      messages: Array<{ content: string }>;
    };
    const content = JSON.parse(payload.messages[0]!.content) as { text: string };

    expect(content.text.length).toBeLessThanOrEqual(32_000);
  });
});
