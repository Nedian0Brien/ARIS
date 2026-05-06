/**
 * Codex provider barrel.
 *
 * Re-exports the public surface of the codex/ subtree. The adapter itself
 * is not registered with `cliProviderRegistry` from this barrel — that
 * happens in `./bootstrap.ts`, which is intentionally not imported from
 * any runtime entry point in Phase 2 Sprint 2.
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
