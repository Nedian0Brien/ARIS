/**
 * Codex command builder.
 *
 * Mirrors the Claude/Gemini precedent in `claudeLauncher.ts` /
 * `geminiLauncher.ts`. Returns a `CodexLaunchCommand` describing the binary
 * name, args, and channel selection (`app-server` vs `exec`).
 *
 * The exec-mode args returned here are used by both `CodexAdapter` and the
 * live `runCodexExecCli` path so command construction stays in one place.
 *
 * App-server-mode commands are also returned here, even though the
 * app-server transport is more complex than a single `spawn(...)` call.
 * The caller (Sprint 4 extraction) is responsible for spawning the
 * app-server, reserving a port, and connecting the WebSocket — this
 * builder only assembles the command-line arguments.
 */

import type { ApprovalPolicy } from '../../../types.js';
import type {
  CodexApprovalPolicy,
  CodexBuildCommandInput,
  CodexLaunchCommand,
  CodexReasoningEffort,
  CodexSandboxMode,
} from './types.js';

const DEFAULT_SANDBOX_MODE: CodexSandboxMode = 'workspace-write';

/**
 * Resolve channel selection from explicit input or the CODEX_RUNTIME_MODE env.
 *
 * Pure helper exposed for tests.
 */
export function resolveCodexChannel(
  explicit?: 'app-server' | 'exec',
  envValue?: string,
): 'app-server' | 'exec' {
  if (explicit === 'exec' || explicit === 'app-server') {
    return explicit;
  }
  const normalized = (envValue ?? '').trim().toLowerCase();
  return normalized === 'exec' ? 'exec' : 'app-server';
}

/**
 * Normalize ARIS-wide ApprovalPolicy → codex `-a` arg.
 *
 * - `on-request` / `on-failure` / `never` pass through.
 * - `yolo` collapses to `never` (the caller separately forces sandbox to
 *   `danger-full-access`).
 */
export function normalizeCodexApprovalPolicy(value: ApprovalPolicy): CodexApprovalPolicy {
  if (value === 'on-failure' || value === 'never') {
    return value;
  }
  if (value === 'yolo') {
    return 'never';
  }
  return 'on-request';
}

/**
 * Resolve the sandbox mode honoring the yolo escalation.
 */
export function resolveCodexSandboxMode(input: {
  approvalPolicy: ApprovalPolicy;
  override?: CodexSandboxMode;
  envSandboxMode?: string;
}): CodexSandboxMode {
  if (input.approvalPolicy === 'yolo') {
    return 'danger-full-access';
  }
  if (input.override) {
    return input.override;
  }
  const envValue = (input.envSandboxMode ?? '').trim();
  if (envValue === 'read-only' || envValue === 'workspace-write' || envValue === 'danger-full-access') {
    return envValue;
  }
  return DEFAULT_SANDBOX_MODE;
}

function appendIfTruthy<T extends string>(args: string[], flag: T, value: string | undefined | null): void {
  if (value && value.length > 0) {
    args.push(flag, value);
  }
}

function appendReasoningEffort(args: string[], reasoningEffort?: CodexReasoningEffort | null): void {
  if (!reasoningEffort) {
    return;
  }
  args.push('-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
}

/**
 * Build a CodexLaunchCommand.
 *
 * exec channel args (matches `runtimeCore.ts:4198` baseline):
 *   codex
 *     -a <approvalPolicy>
 *     -s <sandboxMode>
 *     [-m <model>]
 *     [-c model_reasoning_effort=<JSON-quoted enum>]
 *     exec [resume <threadId>] --json <prompt>
 *
 * app-server channel args (the caller wraps this with port reservation and
 * websocket setup; Sprint 4 will own that lifecycle):
 *   codex
 *     -a <approvalPolicy>
 *     -s <sandboxMode>
 *     [-m <model>]
 *     [-c model_reasoning_effort=<JSON-quoted enum>]
 *     app-server
 */
export function buildCodexCommand(input: CodexBuildCommandInput): CodexLaunchCommand {
  const approvalPolicy = normalizeCodexApprovalPolicy(input.approvalPolicy);
  const sandboxMode = resolveCodexSandboxMode({
    approvalPolicy: input.approvalPolicy,
    override: input.sandboxMode,
    envSandboxMode: process.env.CODEX_SANDBOX_MODE,
  });
  const channel = resolveCodexChannel(input.channel, process.env.CODEX_RUNTIME_MODE);

  const args: string[] = ['-a', approvalPolicy, '-s', sandboxMode];
  appendIfTruthy(args, '-m', input.model);
  appendReasoningEffort(args, input.reasoningEffort);

  if (channel === 'exec') {
    if (input.threadId && input.threadId.trim().length > 0) {
      args.push('exec', 'resume', input.threadId.trim(), '--json', input.prompt);
    } else {
      args.push('exec', '--json', input.prompt);
    }
  } else {
    args.push('app-server');
  }

  return {
    command: 'codex',
    args,
    requiresPty: false,
    streamJson: true,
    channel,
  };
}
