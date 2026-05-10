import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexAdapter } from '../src/runtime/providers/codex/codexAdapter.js';

describe('codexAdapter', () => {
  const savedEnv = { runtime: process.env.CODEX_RUNTIME_MODE };

  beforeEach(() => {
    process.env.CODEX_RUNTIME_MODE = 'exec';
  });

  afterEach(() => {
    if (savedEnv.runtime === undefined) {
      delete process.env.CODEX_RUNTIME_MODE;
    } else {
      process.env.CODEX_RUNTIME_MODE = savedEnv.runtime;
    }
  });

  it('reports provider id and display name', () => {
    expect(codexAdapter.getProviderId()).toBe('codex');
    expect(codexAdapter.getDisplayName()).toBe('OpenAI Codex CLI');
  });

  it('builds CLI args via the launcher', () => {
    const args = codexAdapter.getCliArgs({
      workDir: '/tmp/example',
      model: 'gpt-5.1-codex',
      reasoningEffort: 'medium',
      threadId: 'thread-xyz',
    });
    expect(args).toContain('-m');
    expect(args).toContain('gpt-5.1-codex');
    expect(args).toContain('exec');
    expect(args).toContain('resume');
    expect(args).toContain('thread-xyz');
  });

  it('parses codex exec stdout through the shared protocol mapper', () => {
    const message = codexAdapter.parseStdout(
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
    );

    expect(message).toEqual({
      envelopes: [
        {
          kind: 'turn-start',
          provider: 'codex',
          source: 'system',
          threadId: 'thread-123',
          threadIdSource: 'observed',
        },
      ],
      sideEffect: {
        type: 'update_provider_state',
        providerState: { threadId: 'thread-123' },
      },
    });
  });

  it('writes newline-delimited message content to process stdin', () => {
    const writes: string[] = [];
    const proc = {
      stdin: {
        destroyed: false,
        writable: true,
        write: (chunk: string) => {
          writes.push(chunk);
          return true;
        },
      },
    };

    expect(codexAdapter.sendMessage(proc as never, 'hello codex')).toBe(true);
    expect(writes).toEqual(['hello codex\n']);
  });

  it('returns false for session config patches when no writable transport exists', () => {
    expect(codexAdapter.updateSessionConfig({} as never, { model: 'gpt-5.3-codex' })).toBe(false);
  });
});
