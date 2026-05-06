import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexAdapter } from '../src/runtime/providers/codex/codexAdapter.js';

describe('codexAdapter (Sprint 2 skeleton)', () => {
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

  it('throws NotYetWiredError on spawn() until Sprint 6', async () => {
    await expect(
      codexAdapter.spawn({ workDir: '/tmp/example' }),
    ).rejects.toThrow(/not wired yet/i);
  });

  it('throws NotYetWiredError on sendMessage() until Sprint 6', () => {
    expect(() => codexAdapter.sendMessage(null, 'hi')).toThrow(/not wired yet/i);
  });

  it('throws NotYetWiredError on parseStdout() until Sprint 6', () => {
    expect(() => codexAdapter.parseStdout('{}')).toThrow(/not wired yet/i);
  });
});
