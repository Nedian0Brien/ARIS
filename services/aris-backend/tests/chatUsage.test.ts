import { describe, expect, it } from 'vitest';
import { extractCodexChatUsage } from '../src/runtime/providers/codex/codexUsage.js';
import { parseClaudeSessionLog } from '../src/runtime/import/providerSessionImportParsers.js';

describe('extractCodexChatUsage', () => {
  // 실측 raw 로그(thread/tokenUsage/updated)의 params 형태 그대로.
  const params = {
    threadId: 'thread-1',
    turnId: 'turn-9',
    tokenUsage: {
      total: {
        totalTokens: 5_569_014,
        inputTokens: 5_552_306,
        cachedInputTokens: 5_426_048,
        outputTokens: 16_708,
        reasoningOutputTokens: 6_634,
      },
      last: {
        totalTokens: 107_594,
        inputTokens: 106_000,
        cachedInputTokens: 96_000,
        outputTokens: 1_594,
      },
      modelContextWindow: 258_400,
    },
  };

  it('maps codex token usage notifications to ChatUsageStats', () => {
    const usage = extractCodexChatUsage(params, 'gpt-5.5');

    expect(usage).not.toBeNull();
    expect(usage?.provider).toBe('codex');
    expect(usage?.model).toBe('gpt-5.5');
    expect(usage?.contextWindow).toBe(258_400);
    expect(usage?.total.totalTokens).toBe(5_569_014);
    expect(usage?.total.reasoningOutputTokens).toBe(6_634);
    expect(usage?.lastTurn?.totalTokens).toBe(107_594);
    expect(typeof usage?.updatedAt).toBe('string');
  });

  it('returns null when the notification has no usable totals', () => {
    expect(extractCodexChatUsage({}, 'gpt-5.5')).toBeNull();
    expect(extractCodexChatUsage({ tokenUsage: { total: {} } }, 'gpt-5.5')).toBeNull();
  });
});

describe('parseClaudeSessionLog usage accumulation', () => {
  const lines = [
    JSON.stringify({
      type: 'user',
      sessionId: 'claude-session-1',
      cwd: '/home/ubuntu/project/ARIS',
      message: { role: 'user', content: '첫 질문' },
      timestamp: '2026-07-11T00:00:01.000Z',
      uuid: 'u1',
    }),
    JSON.stringify({
      type: 'assistant',
      sessionId: 'claude-session-1',
      message: {
        role: 'assistant',
        model: 'claude-fable-5',
        content: [{ type: 'text', text: '첫 답변' }],
        usage: {
          input_tokens: 12,
          cache_read_input_tokens: 1_000,
          cache_creation_input_tokens: 500,
          output_tokens: 200,
        },
      },
      timestamp: '2026-07-11T00:00:02.000Z',
      uuid: 'a1',
    }),
    // 사이드체인(서브에이전트) 레코드의 usage는 본 채팅에 누적하지 않는다.
    JSON.stringify({
      type: 'assistant',
      isSidechain: true,
      sessionId: 'claude-session-1',
      message: {
        role: 'assistant',
        model: 'claude-fable-5',
        content: [{ type: 'text', text: '사이드체인' }],
        usage: { input_tokens: 999_999, output_tokens: 999_999 },
      },
      uuid: 'side1',
    }),
    JSON.stringify({
      type: 'assistant',
      sessionId: 'claude-session-1',
      message: {
        role: 'assistant',
        model: 'claude-fable-5',
        content: [{ type: 'text', text: '둘째 답변' }],
        usage: {
          input_tokens: 20,
          cache_read_input_tokens: 2_000,
          cache_creation_input_tokens: 0,
          output_tokens: 300,
        },
      },
      timestamp: '2026-07-11T00:00:03.000Z',
      uuid: 'a2',
    }),
  ].join('\n');

  it('accumulates totals and keeps the last assistant usage as lastTurn', () => {
    const parsed = parseClaudeSessionLog(lines, { sourcePath: '/tmp/claude.jsonl' });

    expect(parsed.usage).not.toBeNull();
    expect(parsed.usage?.provider).toBe('claude');
    expect(parsed.usage?.model).toBe('claude-fable-5');
    expect(parsed.usage?.contextWindow).toBe(200_000);
    expect(parsed.usage?.total.inputTokens).toBe(32);
    expect(parsed.usage?.total.cachedInputTokens).toBe(3_500);
    expect(parsed.usage?.total.outputTokens).toBe(500);
    expect(parsed.usage?.lastTurn).toEqual({
      totalTokens: 20 + 2_000 + 300,
      inputTokens: 20,
      cachedInputTokens: 2_000,
      outputTokens: 300,
    });
  });

  it('returns null usage when no assistant record carries usage', () => {
    const noUsage = JSON.stringify({
      type: 'assistant',
      sessionId: 's',
      message: { role: 'assistant', content: [{ type: 'text', text: '답' }] },
      uuid: 'x1',
    });
    const parsed = parseClaudeSessionLog(noUsage, { sourcePath: '/tmp/claude.jsonl' });
    expect(parsed.usage).toBeNull();
  });
});
