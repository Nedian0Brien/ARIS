import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mapCodexAppServerNotification } from '../src/runtime/providers/codex/codexProtocolMapper.js';

/**
 * Phase 2 Sprint 8 — real-trace fixture conformance.
 *
 * These fixtures were captured from a live codex app-server session on
 * 2026-05-08 (the Sprint 4 / 5 / 6 verification turns). They preserve the
 * actual JSON-RPC notification shapes that codex CLI v0.128.0 emits, with
 * UUIDs and message ids redacted. They guard against regressions in the
 * mapper's tolerance for field naming, optional metadata, and payload
 * nesting that synthetic fixtures might not exercise.
 */

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'codex');

function loadFixture(name: string): { method: string; params: Record<string, unknown> } {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, `${name}.json`), 'utf-8'));
  return {
    method: typeof raw.method === 'string' ? raw.method : '',
    params: raw.params && typeof raw.params === 'object' ? raw.params : {},
  };
}

describe('codexProtocolMapper — real-trace fixtures', () => {
  it('thread-started: extracts threadId from nested params.thread.id', () => {
    const { method, params } = loadFixture('thread-started');
    expect(method).toBe('thread/started');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0];
    expect(env.kind).toBe('turn-start');
    expect('threadId' in env && env.threadId).toBe('REDACTED-UUID');
    expect(result!.sideEffect?.type).toBe('update_provider_state');
  });

  it('item-completed-agent-message: emits text envelope from real codex agentMessage shape', () => {
    const { method, params } = loadFixture('item-completed-agent-message');
    expect(method).toBe('item/completed');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).not.toBeNull();
    expect(result!.envelopes).toHaveLength(1);
    const env = result!.envelopes[0];
    expect(env.kind).toBe('text');
    expect('text' in env && env.text).toBe('Hi');
    expect('source' in env && env.source).toBe('assistant');
    // Real fixture has both threadId and turnId at the params level
    expect('turnId' in env && env.turnId).toBe('REDACTED-UUID');
  });

  it('item-completed-command-execution: emits tool-call envelopes + emit_action side effect', () => {
    const { method, params } = loadFixture('item-completed-command-execution');
    expect(method).toBe('item/completed');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).not.toBeNull();
    // Real codex commandExecution emits tool-call-start + tool-call-end
    expect(result!.envelopes.length).toBe(2);
    expect(result!.envelopes[0].kind).toBe('tool-call-start');
    expect(result!.envelopes[1].kind).toBe('tool-call-end');
    expect(result!.sideEffect?.type).toBe('emit_action');
    if (result!.sideEffect?.type === 'emit_action') {
      // Sed call → file_read action
      expect(['file_read', 'command_execution']).toContain(result!.sideEffect.action.actionType);
    }
  });

  it('agent-message-delta: returns textDelta for streaming chunk', () => {
    const { method, params } = loadFixture('agent-message-delta');
    expect(method).toBe('item/agentMessage/delta');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).not.toBeNull();
    expect(typeof result!.textDelta).toBe('string');
    expect((result!.textDelta || '').length).toBeGreaterThan(0);
    expect(result!.envelopes).toHaveLength(0);
  });

  it('turn-completed: emits turn-end with completed stopReason + turn_complete side effect', () => {
    const { method, params } = loadFixture('turn-completed');
    expect(method).toBe('turn/completed');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).not.toBeNull();
    expect(result!.envelopes[0].kind).toBe('turn-end');
    const env = result!.envelopes[0];
    expect('stopReason' in env && env.stopReason).toBe('completed');
    expect(result!.sideEffect?.type).toBe('turn_complete');
    if (result!.sideEffect?.type === 'turn_complete') {
      expect(result!.sideEffect.reason).toBe('completed');
    }
  });

  it('thread-status-idle: handler returns null (not a method we map)', () => {
    const { method, params } = loadFixture('thread-status-idle');
    expect(method).toBe('thread/status/changed');
    const result = mapCodexAppServerNotification(method, params);
    expect(result).toBeNull();
  });
});
