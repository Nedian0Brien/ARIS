/**
 * Codex CliProvider adapter.
 *
 * Wires the structural provider slot to the shared Codex command builder and
 * exec-channel protocol mapper. Higher-level turn orchestration still lives
 * in `codexRuntime.ts`; this adapter owns process-level primitives that can
 * be registered in `cliProviderRegistry`.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import type {
  CliMessageContent,
  CliProvider,
  CliRuntimeConfigPatch,
  CliSpawnOptions,
  CliSpawnResult,
} from '../../contracts/cliProvider.js';
import type { ParsedMessage } from '../../contracts/parsedMessage.js';
import type { CheckStatusOptions, CliStatusResult } from '../../contracts/cliStatus.js';
import { buildCodexCommand } from './codexLauncher.js';
import { parseCodexExecLine } from './codexProtocolMapper.js';
import type { CodexReasoningEffort, CodexSandboxMode } from './types.js';

const CODEX_DISPLAY_NAME = 'OpenAI Codex CLI';
const CHECK_STATUS_TIMEOUT_MS = 5_000;
const AGENT_EXTRA_PATHS = '/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v20.18.1/bin:/home/ubuntu/.bun/bin';

type CodexAdapterSpawnOptions = CliSpawnOptions & {
  sandboxMode?: CodexSandboxMode;
  channel?: 'app-server' | 'exec';
};

const execFileAsync = promisify(execFile);

function normalizeReasoningEffort(value: string | null | undefined): CodexReasoningEffort | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }
  return undefined;
}

function buildAdapterCommand(options: CliSpawnOptions) {
  const codexOptions = options as CodexAdapterSpawnOptions;
  const reasoningEffort = normalizeReasoningEffort(codexOptions.reasoningEffort);
  return buildCodexCommand({
    prompt: codexOptions.prompt ?? '',
    approvalPolicy: codexOptions.approvalPolicy ?? 'on-request',
    ...(codexOptions.model ? { model: codexOptions.model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(codexOptions.threadId ? { threadId: codexOptions.threadId } : {}),
    ...(codexOptions.sandboxMode ? { sandboxMode: codexOptions.sandboxMode } : {}),
    ...(codexOptions.channel ? { channel: codexOptions.channel } : {}),
  });
}

function encodeMessageContent(content: CliMessageContent): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

async function probeCodexVersion(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync('codex', ['--version'], {
      timeout: CHECK_STATUS_TIMEOUT_MS,
      windowsHide: true,
    });
    const trimmed = stdout.trim();
    return { ok: true, version: trimmed.length > 0 ? trimmed : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export class CodexAdapter implements CliProvider {
  getProviderId(): 'codex' {
    return 'codex';
  }

  getDisplayName(): string {
    return CODEX_DISPLAY_NAME;
  }

  async isAvailable(options?: CheckStatusOptions): Promise<boolean> {
    const result = await this.checkStatus(options);
    return result.status === 'connected';
  }

  getCliArgs(options: CliSpawnOptions): string[] {
    return buildAdapterCommand(options).args;
  }

  async spawn(options: CliSpawnOptions): Promise<CliSpawnResult> {
    const command = buildAdapterCommand(options);
    const env = {
      ...process.env,
      ...options.envOverrides,
    };
    const child = spawn(command.command, command.args, {
      cwd: options.workDir,
      env: {
        ...env,
        PATH: `${env.PATH || ''}:${AGENT_EXTRA_PATHS}`,
      },
      signal: options.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, process: child };
  }

  sendMessage(proc: ChildProcess, content: CliMessageContent): boolean {
    const stdin = proc.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      return false;
    }
    return stdin.write(`${encodeMessageContent(content)}\n`);
  }

  parseStdout(line: string): ParsedMessage | null {
    return parseCodexExecLine(line);
  }

  updateSessionConfig(_proc: ChildProcess, _patch: CliRuntimeConfigPatch): boolean {
    return false;
  }

  async checkStatus(_options?: CheckStatusOptions): Promise<CliStatusResult> {
    const probe = await probeCodexVersion();
    if (!probe.ok) {
      return {
        status: 'not_installed',
        ...(probe.error ? { errorMessage: probe.error } : {}),
      };
    }
    // A successful `--version` is enough to mark codex as connected at the
    // probe level. Auth state (`codex login` status) is checked at turn time
    // and surfaced via runtime errors.
    return {
      status: 'connected',
      ...(probe.version ? { version: probe.version } : {}),
    };
  }
}

export const codexAdapter = new CodexAdapter();
