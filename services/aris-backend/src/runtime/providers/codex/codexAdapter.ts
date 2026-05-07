/**
 * Codex CliProvider adapter.
 *
 * Phase 2 Sprint 2 establishes the adapter as a structural slot. Only the
 * read-only methods (`getProviderId`, `getDisplayName`, `getCliArgs`,
 * `isAvailable`, `checkStatus`) are functional. Process-lifecycle methods
 * (`spawn`, `sendMessage`, `parseStdout`, …) throw `NotYetWiredError` —
 * Sprint 6 will replace those throws with extracted logic from
 * `runtimeCore.ts`.
 *
 * The adapter is registered with `cliProviderRegistry` via
 * `./bootstrap.ts`, but bootstrap is not imported anywhere in production
 * code yet. The registry remains empty at runtime until Sprint 6 wires the
 * import — keeping Sprint 2 zero-risk.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const CODEX_DISPLAY_NAME = 'OpenAI Codex CLI';
const CHECK_STATUS_TIMEOUT_MS = 5_000;

class NotYetWiredError extends Error {
  constructor(method: string) {
    super(
      `CodexAdapter.${method}() is not wired yet. Phase 2 Sprint 2 ships only the structural slot; ` +
        'Sprint 6 will extract the implementation from runtimeCore.ts.',
    );
    this.name = 'NotYetWiredError';
  }
}

const execFileAsync = promisify(execFile);

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

  /**
   * Build the codex CLI args for the given spawn options.
   *
   * Sprint 2 surfaces this via the launcher even though spawn() itself is
   * not yet wired — the args builder is a pure function and is safe to
   * exercise from tests.
   *
   * Note: this method assumes the caller has already mapped its own concept
   * of approvalPolicy/model into spawn options. Until full wiring lands in
   * Sprint 6, the spawn-options shape doesn't carry approvalPolicy, so we
   * default to `on-request` here and let tests cover the launcher's full
   * input shape directly.
   */
  getCliArgs(options: CliSpawnOptions): string[] {
    const command = buildCodexCommand({
      prompt: '',
      approvalPolicy: 'on-request',
      ...(options.model ? { model: options.model } : {}),
      ...(options.reasoningEffort
        ? { reasoningEffort: options.reasoningEffort as 'low' | 'medium' | 'high' | 'xhigh' }
        : {}),
      ...(options.threadId ? { threadId: options.threadId } : {}),
    });
    return command.args;
  }

  async spawn(_options: CliSpawnOptions): Promise<CliSpawnResult> {
    throw new NotYetWiredError('spawn');
  }

  sendMessage(_proc: unknown, _content: CliMessageContent): boolean {
    throw new NotYetWiredError('sendMessage');
  }

  parseStdout(_line: string): ParsedMessage | null {
    throw new NotYetWiredError('parseStdout');
  }

  updateSessionConfig(_proc: unknown, _patch: CliRuntimeConfigPatch): boolean {
    throw new NotYetWiredError('updateSessionConfig');
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
    // probe level. Auth state (`codex login` status) is checked by happyClient
    // at turn time and surfaced via runtime errors. A richer auth probe will
    // land in Sprint 6 alongside the runtime extraction.
    return {
      status: 'connected',
      ...(probe.version ? { version: probe.version } : {}),
    };
  }
}

export const codexAdapter = new CodexAdapter();
