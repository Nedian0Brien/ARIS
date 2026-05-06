import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCodexCommand,
  normalizeCodexApprovalPolicy,
  resolveCodexChannel,
  resolveCodexSandboxMode,
} from '../src/runtime/providers/codex/codexLauncher.js';

const ENV_KEYS = ['CODEX_RUNTIME_MODE', 'CODEX_SANDBOX_MODE'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

describe('codexLauncher', () => {
  const savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = savedEnv[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  describe('resolveCodexChannel', () => {
    it('honors explicit selection over env', () => {
      expect(resolveCodexChannel('exec', 'app-server')).toBe('exec');
      expect(resolveCodexChannel('app-server', 'exec')).toBe('app-server');
    });

    it('falls back to env when explicit is omitted', () => {
      expect(resolveCodexChannel(undefined, 'exec')).toBe('exec');
      expect(resolveCodexChannel(undefined, 'app-server')).toBe('app-server');
    });

    it('defaults to app-server when neither input nor env is provided', () => {
      expect(resolveCodexChannel()).toBe('app-server');
    });

    it('treats unknown env values as app-server', () => {
      expect(resolveCodexChannel(undefined, 'wat')).toBe('app-server');
    });
  });

  describe('normalizeCodexApprovalPolicy', () => {
    it('passes through valid codex-side policies', () => {
      expect(normalizeCodexApprovalPolicy('on-request')).toBe('on-request');
      expect(normalizeCodexApprovalPolicy('on-failure')).toBe('on-failure');
      expect(normalizeCodexApprovalPolicy('never')).toBe('never');
    });

    it('collapses yolo to never (sandbox handles full-access escalation)', () => {
      expect(normalizeCodexApprovalPolicy('yolo')).toBe('never');
    });
  });

  describe('resolveCodexSandboxMode', () => {
    it('forces danger-full-access when approval is yolo regardless of override', () => {
      expect(
        resolveCodexSandboxMode({
          approvalPolicy: 'yolo',
          override: 'workspace-write',
          envSandboxMode: 'read-only',
        }),
      ).toBe('danger-full-access');
    });

    it('uses override when approval is non-yolo', () => {
      expect(
        resolveCodexSandboxMode({
          approvalPolicy: 'on-request',
          override: 'read-only',
          envSandboxMode: 'workspace-write',
        }),
      ).toBe('read-only');
    });

    it('reads env when override is omitted and value is recognized', () => {
      expect(
        resolveCodexSandboxMode({
          approvalPolicy: 'on-request',
          envSandboxMode: 'read-only',
        }),
      ).toBe('read-only');
    });

    it('falls back to workspace-write default when env is unrecognized', () => {
      expect(
        resolveCodexSandboxMode({
          approvalPolicy: 'on-request',
          envSandboxMode: 'wat',
        }),
      ).toBe('workspace-write');
    });
  });

  describe('buildCodexCommand', () => {
    it('builds fresh exec args with default sandbox and no model/reasoning', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      const command = buildCodexCommand({
        prompt: 'Reply with OK',
        approvalPolicy: 'on-request',
      });
      expect(command.command).toBe('codex');
      expect(command.channel).toBe('exec');
      expect(command.streamJson).toBe(true);
      expect(command.requiresPty).toBe(false);
      expect(command.args).toEqual([
        '-a',
        'on-request',
        '-s',
        'workspace-write',
        'exec',
        '--json',
        'Reply with OK',
      ]);
    });

    it('builds resume exec args when threadId is provided', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      const command = buildCodexCommand({
        prompt: 'continue',
        approvalPolicy: 'never',
        threadId: 'thread-abc-123',
      });
      expect(command.args).toEqual([
        '-a',
        'never',
        '-s',
        'workspace-write',
        'exec',
        'resume',
        'thread-abc-123',
        '--json',
        'continue',
      ]);
    });

    it('appends model and reasoning effort flags when supplied', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      const command = buildCodexCommand({
        prompt: 'work',
        approvalPolicy: 'on-failure',
        model: 'gpt-5.1-codex',
        reasoningEffort: 'high',
      });
      expect(command.args).toEqual([
        '-a',
        'on-failure',
        '-s',
        'workspace-write',
        '-m',
        'gpt-5.1-codex',
        '-c',
        'model_reasoning_effort="high"',
        'exec',
        '--json',
        'work',
      ]);
    });

    it('forces danger-full-access sandbox under yolo approval', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      const command = buildCodexCommand({
        prompt: 'rm -rf',
        approvalPolicy: 'yolo',
      });
      expect(command.args.slice(0, 4)).toEqual(['-a', 'never', '-s', 'danger-full-access']);
    });

    it('builds app-server args when channel resolves to app-server', () => {
      process.env.CODEX_RUNTIME_MODE = 'app-server';
      const command = buildCodexCommand({
        prompt: 'ignored-by-app-server-args',
        approvalPolicy: 'on-request',
      });
      expect(command.channel).toBe('app-server');
      expect(command.args).toEqual([
        '-a',
        'on-request',
        '-s',
        'workspace-write',
        'app-server',
      ]);
    });

    it('respects CODEX_SANDBOX_MODE when no override and approval is non-yolo', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      process.env.CODEX_SANDBOX_MODE = 'read-only';
      const command = buildCodexCommand({
        prompt: 'inspect',
        approvalPolicy: 'on-request',
      });
      expect(command.args).toContain('read-only');
    });

    it('drops empty threadId rather than emitting `resume `', () => {
      process.env.CODEX_RUNTIME_MODE = 'exec';
      const command = buildCodexCommand({
        prompt: 'p',
        approvalPolicy: 'on-request',
        threadId: '   ',
      });
      expect(command.args).not.toContain('resume');
    });
  });
});
