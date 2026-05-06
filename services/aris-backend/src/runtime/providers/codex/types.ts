/**
 * Codex provider type aliases.
 *
 * Mirrors the Claude/Gemini precedent in `claude/types.ts` and `gemini/types.ts`:
 * provider-specific names are aliased over the canonical Provider* types so
 * call sites can read intent without coupling to ARIS-wide vocabulary.
 *
 * Phase 2 Sprint 2 introduces this file as part of the codex/ skeleton.
 * Subsequent sprints will extend it with codex-specific subtypes (thread
 * cache key, app-server failure kinds, etc.) as logic is extracted from
 * happyClient.ts.
 */

import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import type {
  ProviderActionEvent,
  ProviderCliResult,
  ProviderCommandExecutor,
  ProviderLaunchCommand,
  ProviderPermissionRequest,
  ProviderResumeTarget,
  ProviderTextEvent,
  ProviderThreadIdSource,
} from '../../contracts/providerRuntime.js';
import type { ApprovalPolicy, PermissionDecision } from '../../../types.js';

export type CodexResumeTarget = ProviderResumeTarget;
export type CodexThreadIdSource = ProviderThreadIdSource;
export type CodexActionEvent = ProviderActionEvent;
export type CodexPermissionRequest = ProviderPermissionRequest;
export type CodexTextEvent = ProviderTextEvent;

export type CodexCliResult = ProviderCliResult & {
  protocolEnvelopes?: SessionProtocolEnvelope[];
};

/**
 * `codex` exec/app-server CLI launch command. The `streamJson` flag is always
 * true because both channels emit JSON envelopes that the runtime parses as
 * a stream — even though the on-wire transport differs (stdout lines vs.
 * WebSocket frames).
 */
export type CodexLaunchCommand = ProviderLaunchCommand<'codex'> & {
  /**
   * Channel selector at command-build time. Defaults to "app-server" but the
   * caller may force "exec" via the CODEX_RUNTIME_MODE env. The launcher
   * encodes the choice into the args returned here.
   */
  channel: 'app-server' | 'exec';
  streamJson: true;
};

export type CodexCommandExecutor = ProviderCommandExecutor<CodexLaunchCommand>;

export type CodexTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: CodexActionEvent[];
  threadId?: string;
  threadIdSource: CodexThreadIdSource;
  protocolEnvelopes?: SessionProtocolEnvelope[];
};

export type CodexRunScope = {
  sessionId: string;
  chatId?: string;
};

/**
 * Reasoning effort accepted by codex. Codex's `-c model_reasoning_effort`
 * flag accepts these enum values; the runtime encodes them as JSON-quoted
 * strings.
 */
export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Codex sandbox mode. `workspace-write` is the default; `danger-full-access`
 * is selected automatically when approval policy is `yolo`.
 */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * Codex approval policy. Subset of ARIS's ApprovalPolicy mapped through
 * normalizeCodexApprovalPolicy(). `yolo` is not represented here because it
 * collapses into `never` + sandbox=danger-full-access.
 */
export type CodexApprovalPolicy = 'on-request' | 'on-failure' | 'never';

/**
 * Inputs accepted by the Codex launcher's command builder.
 */
export interface CodexBuildCommandInput {
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  reasoningEffort?: CodexReasoningEffort | null;
  sandboxMode?: CodexSandboxMode;
  /** Forces exec channel; otherwise the launcher reads CODEX_RUNTIME_MODE env. */
  channel?: 'app-server' | 'exec';
  /** When provided AND channel === 'exec', emits `exec resume <threadId>`. */
  threadId?: string;
}

/** Re-export for downstream callers; equivalent to ARIS-wide PermissionDecision. */
export type CodexPermissionDecision = PermissionDecision;
