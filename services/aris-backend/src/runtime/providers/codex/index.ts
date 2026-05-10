/**
 * Codex provider barrel.
 *
 * Re-exports the public surface of the codex/ subtree. The adapter itself is
 * registered by `./bootstrap.ts`, which the backend entry point imports once
 * for its side effect.
 */

export type {
  CodexApprovalPolicy,
  CodexBuildCommandInput,
  CodexCliResult,
  CodexCommandExecutor,
  CodexLaunchCommand,
  CodexPermissionDecision,
  CodexPermissionRequest,
  CodexReasoningEffort,
  CodexResumeTarget,
  CodexRunScope,
  CodexSandboxMode,
  CodexTextEvent,
  CodexThreadIdSource,
  CodexTurnResult,
} from './types.js';

export {
  buildCodexCommand,
  normalizeCodexApprovalPolicy,
  resolveCodexChannel,
  resolveCodexSandboxMode,
} from './codexLauncher.js';

export {
  collectCodexNestedRecords,
  extractCodexObservedThreadId,
  extractCodexRequestId,
  extractFirstCodexStringByKeys,
  parseCodexJsonLine,
} from './codexProtocolFields.js';

export { CodexAdapter, codexAdapter } from './codexAdapter.js';
