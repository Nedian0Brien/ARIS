import { describe, expect, it } from 'vitest';
import {
  looksLikeClaudeActionTranscript,
  mapClaudeStreamOutputToProtocol,
  parseClaudeStreamLine,
  parseClaudeStreamOutput,
} from '../src/runtime/providers/claude/claudeProtocolMapper.js';

describe('claudeProtocolMapper', () => {
  it('keeps action extraction while dropping transcript-only assistant output', () => {
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

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toBe('ls -la');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-start');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-end');
    expect(looksLikeClaudeActionTranscript('$ ls -la\nexit code: 0')).toBe(true);
  });

  it('extracts session ids from Claude stream output', () => {
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

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-abc');
    expect(parsed.output).toBe('응답 완료');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
    ]);
  });

  it('extracts lowercase sessionid fields from Claude init payloads', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        sessionid: 'claude-session-lowercase',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '응답 완료',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-lowercase');
    expect(parsed.envelopes[0]).toMatchObject({
      kind: 'turn-start',
      sessionId: 'claude-session-lowercase',
      threadId: 'claude-session-lowercase',
    });
  });

  it('extracts result-only final output when Claude omits an assistant text event', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-result-only',
      }),
      JSON.stringify({
        type: 'result',
        result: 'OK',
        session_id: 'claude-session-result-only',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-result-only');
    expect(parsed.output).toBe('OK');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('turn-end');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('stop');
  });

  it('surfaces Claude error payload text instead of treating it as an empty response', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-error',
      }),
      JSON.stringify({
        type: 'error',
        session_id: 'claude-session-error',
        message: 'Prompt is too long',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-error');
    expect(parsed.output).toBe('');
    expect(parsed.errorText).toBe('Prompt is too long');
    expect(parsed.envelopes).toContainEqual(expect.objectContaining({
      kind: 'turn-end',
      stopReason: 'error',
      threadId: 'claude-session-error',
    }));
    expect(parsed.envelopes).toContainEqual(expect.objectContaining({
      kind: 'stop',
      reason: 'error',
    }));
  });

  it('does not expose result error payload text as normal assistant output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-result-error',
      }),
      JSON.stringify({
        type: 'result',
        stop_reason: 'error',
        session_id: 'claude-session-result-error',
        result: 'Prompt is too long',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.errorText).toBe('Prompt is too long');
    expect(parsed.envelopes.some((envelope) => envelope.kind === 'text')).toBe(false);
  });

  it('strips plan status metadata from Claude assistant output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-plan',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가
status: in_progress

session source를 observed 우선 정책으로 조정
status: pending`,
            },
          ],
        },
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.output).toBe(`Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가

session source를 observed 우선 정책으로 조정`);
  });

  it('does not misclassify assistant/result usage fields as tool events', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-usage',
        message: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK.' }],
          usage: { output_tokens: 2 },
        },
      }),
      JSON.stringify({
        type: 'result',
        result: 'OK.',
        session_id: 'claude-session-usage',
        usage: { server_tool_use: { web_search_requests: 0 } },
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-usage');
    expect(parsed.output).toBe('OK.');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('text');
  });

  it('does not create action events from non-tool result metadata with path-like names', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'OK.',
      session_id: 'claude-session-false-positive',
      summary: 'updated answer',
      references: [
        { name: 'claude.ai Notion' },
      ],
    });

    const parsed = parseClaudeStreamLine(line);
    expect(parsed.action).toBeUndefined();
    expect(parsed.assistantText).toBe('OK.');
    expect(parsed.sessionId).toBe('claude-session-false-positive');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('maps a single Claude tool line into an action event', () => {
    const line = JSON.stringify({
      type: 'tool',
      subtype: 'command_execution',
      callId: 'call-123',
      command: 'git status',
      output: 'On branch main',
    });

    const parsed = parseClaudeStreamLine(line);
    expect(parsed.action?.actionType).toBe('command_execution');
    expect(parsed.action?.callId).toBe('call-123');
    expect(parsed.action?.command).toBe('git status');
    expect(parsed.actionKey).toContain('call-123');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'tool-call-start',
      'tool-call-end',
    ]);
  });

  describe('Claude native tool calls (Edit/Write/MultiEdit) produce CHANGES card signals', () => {
    it('detects Edit tool call and synthesizes a diff with hasDiffSignal=true', () => {
      const line = JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-edit',
        message: {
          id: 'msg_edit',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_edit_001',
              name: 'Edit',
              input: {
                file_path: '/project/src/app.ts',
                old_string: 'const x = 1;',
                new_string: 'const x = 2;\nconst y = 3;',
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      });

      const parsed = parseClaudeStreamLine(line);
      expect(parsed.action?.actionType).toBe('file_write');
      expect(parsed.action?.path).toBe('/project/src/app.ts');
      expect(parsed.action?.hasDiffSignal).toBe(true);
      expect(parsed.action?.deletions).toBe(1);
      expect(parsed.action?.additions).toBe(2);
      expect(parsed.action?.output).toContain('diff --git');
      expect(parsed.action?.output).toContain('-const x = 1;');
      expect(parsed.action?.output).toContain('+const x = 2;');
      expect(parsed.action?.callId).toBe('toolu_edit_001');
    });

    it('detects Write tool call and synthesizes additions-only diff', () => {
      const line = JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-write',
        message: {
          id: 'msg_write',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_write_002',
              name: 'Write',
              input: {
                file_path: '/project/src/new-file.ts',
                content: 'export const hello = "world";\nexport const foo = 42;',
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      });

      const parsed = parseClaudeStreamLine(line);
      expect(parsed.action?.actionType).toBe('file_write');
      expect(parsed.action?.path).toBe('/project/src/new-file.ts');
      expect(parsed.action?.hasDiffSignal).toBe(true);
      expect(parsed.action?.deletions).toBe(0);
      expect(parsed.action?.additions).toBe(2);
      expect(parsed.action?.output).toContain('diff --git');
      expect(parsed.action?.output).toContain('--- /dev/null');
      expect(parsed.action?.output).toContain('+export const hello = "world";');
    });

    it('detects MultiEdit tool call and aggregates diff from all edits', () => {
      const line = JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-multiedit',
        message: {
          id: 'msg_multiedit',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_multiedit_003',
              name: 'MultiEdit',
              input: {
                file_path: '/project/src/utils.ts',
                edits: [
                  { old_string: 'const a = 1;', new_string: 'const a = 10;' },
                  { old_string: 'const b = 2;', new_string: 'const b = 20;\nconst c = 30;' },
                ],
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      });

      const parsed = parseClaudeStreamLine(line);
      expect(parsed.action?.actionType).toBe('file_write');
      expect(parsed.action?.hasDiffSignal).toBe(true);
      expect(parsed.action?.deletions).toBe(2);
      expect(parsed.action?.additions).toBe(3);
      expect(parsed.action?.output).toContain('diff --git');
    });

    it('does not overwrite hasDiffSignal when real diff output already exists', () => {
      const line = JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-apply',
        command: 'apply_patch',
        output: '*** update file: /project/src/app.ts\n-old line\n+new line',
      });

      const parsed = parseClaudeStreamLine(line);
      expect(parsed.action?.hasDiffSignal).toBe(true);
      expect(parsed.action?.output).toContain('*** update file:');
    });
  });

  it('maps Claude stream output into protocol envelopes directly', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-protocol',
      }),
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-protocol',
        command: 'pwd',
        output: '/workspace',
        session_id: 'claude-session-protocol',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        result: '완료',
        session_id: 'claude-session-protocol',
      }),
    ].join('\n');

    const mapped = mapClaudeStreamOutputToProtocol(streamOutput);
    expect(mapped.sessionId).toBe('claude-session-protocol');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
  });
});
