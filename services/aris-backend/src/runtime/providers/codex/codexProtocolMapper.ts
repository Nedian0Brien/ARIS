/**
 * Codex protocol mapper — pure functions.
 *
 * Extracts and centralises codex-specific protocol parsing logic that was
 * previously inlined in `runtimeCore.ts`. Every exported function is pure
 * (no side effects, no I/O, no state mutation). State changes (thread-ID
 * caching, permission routing, message persistence) are expressed as
 * `ParsedMessageSideEffect` descriptors returned to the caller for
 * dispatch.
 *
 * Two channels handled:
 *   exec       — `codex exec --json` stdout, one JSON object per newline.
 *   app-server — WebSocket JSON-RPC notifications from the codex
 *                `app-server` process.
 *
 * Fixture-backed conformance tests: `tests/codexProtocolMapper.test.ts`.
 *
 * `CodexAdapter.parseStdout()` delegates to `parseCodexExecLine`; the live
 * Codex runtime uses the same pure helpers before dispatching side effects.
 */

import type { ParsedMessage } from '../../contracts/parsedMessage.js';
import type {
  SessionProtocolStopReason,
} from '../../contracts/sessionProtocol.js';
import type { PermissionRisk } from '../../../types.js';
import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText, shouldDisplayToolStatus } from '../../agentMessageSanitizer.js';
import { summarizeDiffText, summarizeFileChangeDiff } from '../../diffStats.js';
import { parseCodexJsonLine } from './codexProtocolFields.js';
import type { CodexPermissionRequest } from './types.js';

// ---------------------------------------------------------------------------
// Self-contained micro-utilities (not re-exported from a shared module yet)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function unwrapShellCmd(command: string): string {
  let current = command.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }
  const wrappers = [
    /^(?:\/bin\/)?bash\s+-lc\s+([\s\S]+)$/i,
    /^(?:\/bin\/)?sh\s+-lc\s+([\s\S]+)$/i,
  ];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) {
      continue;
    }
    const inner = match[1]?.trim() ?? '';
    current =
      (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
        ? inner.slice(1, -1).trim()
        : inner;
  }
  return current;
}

function stripAnsiSimple(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '').trim();
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * Returns true when `error` looks like a "thread not found" response from
 * codex. The runtime uses this to decide whether to retry with a fresh thread.
 */
export function isMissingCodexThreadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message.includes('thread') && !message.includes('session')) {
    return false;
  }
  return (
    message.includes('not found')
    || message.includes('unknown')
    || message.includes('invalid')
    || message.includes('does not exist')
    || message.includes('no such')
  );
}

export type CodexAppServerFailureKind =
  | 'aborted'
  | 'missing_thread'
  | 'context_window'
  | 'timeout'
  | 'websocket_connect'
  | 'websocket_closed'
  | 'turn_failed'
  | 'other';

export type CodexAppServerFailureInfo = {
  kind: CodexAppServerFailureKind;
  detail: string;
  clearCachedThread: boolean;
  retryWithFreshThread: boolean;
  logTransportClose: boolean;
};

function isAbortFailure(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR') {
    return true;
  }
  return (
    typeof candidate.message === 'string'
    && candidate.message.toLowerCase().includes('aborted')
  );
}

/**
 * Classify a codex app-server failure into a structured descriptor.
 *
 * The caller inspects `clearCachedThread` / `retryWithFreshThread` to
 * decide whether to evict the thread-cache entry and re-run the turn.
 */
export function classifyCodexAppServerFailure(error: unknown): CodexAppServerFailureInfo {
  const detail = error instanceof Error ? error.message : String(error);
  const message = detail.toLowerCase();

  if (isAbortFailure(error)) {
    return { kind: 'aborted', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: false };
  }

  if (isMissingCodexThreadError(error)) {
    return { kind: 'missing_thread', detail, clearCachedThread: true, retryWithFreshThread: true, logTransportClose: false };
  }

  if (message.includes('context window') || message.includes('ran out of room')) {
    return { kind: 'context_window', detail, clearCachedThread: true, retryWithFreshThread: true, logTransportClose: false };
  }

  if (message.includes('turn timed out')) {
    return { kind: 'timeout', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: false };
  }

  if (
    message.includes('timed out waiting for codex app-server websocket')
    || message.includes('failed to connect to codex app-server websocket')
    || message.includes('websocket connection failed')
    || message.includes('websocket closed before opening')
  ) {
    return { kind: 'websocket_connect', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: false };
  }

  if (message.includes('websocket closed before turn completion')) {
    return { kind: 'websocket_closed', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: true };
  }

  if (message.includes('turn failed')) {
    return { kind: 'turn_failed', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: false };
  }

  return { kind: 'other', detail, clearCachedThread: false, retryWithFreshThread: false, logTransportClose: false };
}

// ---------------------------------------------------------------------------
// Permission extraction
// ---------------------------------------------------------------------------

function normalizeCodexApprovalDecision(value: unknown): PermissionRisk {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text === 'low' || text === 'medium' || text === 'high') {
    return text;
  }
  return 'medium';
}

function inferCodexApprovalRisk(
  payload: Record<string, unknown>,
  fallback: PermissionRisk = 'medium',
): PermissionRisk {
  const directRisk = normalizeCodexApprovalDecision(payload.risk);
  if (directRisk !== 'medium' || String(payload.risk ?? '').trim().length > 0) {
    return directRisk;
  }
  const hasNetworkContext = asRecord(payload.network_approval_context) !== null;
  const hasNetworkAmendments =
    Array.isArray(payload.proposed_network_policy_amendments)
    && payload.proposed_network_policy_amendments.length > 0;
  const additionalPermissions = asRecord(payload.additional_permissions);
  const hasAdditionalPermissions =
    additionalPermissions !== null && Object.keys(additionalPermissions).length > 0;
  const grantRoot = asString(payload.grant_root, '').trim();
  if (hasNetworkContext || hasNetworkAmendments || hasAdditionalPermissions || grantRoot) {
    return 'high';
  }
  return fallback;
}

/**
 * Extract a codex permission request from a raw payload.
 *
 * Handles both top-level `exec_approval_request` / `apply_patch_approval_request`
 * payloads and those nested under an `item.completed` wrapper (exec channel).
 *
 * Returns `null` when the payload does not describe a permission request.
 */
export function extractCodexPermissionRequest(
  payload: Record<string, unknown>,
): CodexPermissionRequest | null {
  const payloadType = asString(payload.type, '').trim();
  const item = payloadType === 'item.completed' ? asRecord(payload.item) : payload;
  if (!item) {
    return null;
  }

  const itemType = asString(item.type, '').trim();
  if (
    itemType !== 'exec_approval_request'
    && itemType !== 'apply_patch_approval_request'
  ) {
    return null;
  }

  const callId = asString(item.call_id, asString(item.item_id, '')).trim();
  if (!callId) {
    return null;
  }

  const approvalId = asString(item.approval_id, '').trim() || undefined;

  if (itemType === 'exec_approval_request') {
    const rawCommand = asString(
      item.command,
      asString(item.parsed_cmd, asString(item.interaction_input, '')),
    ).trim();
    const command = unwrapShellCmd(rawCommand || `exec command (${callId})`);
    const reason = asString(item.reason, '명령 실행을 위해 사용자 승인이 필요합니다.').trim();
    return {
      actionType: 'exec',
      callId,
      approvalId,
      command,
      reason,
      risk: inferCodexApprovalRisk(item),
    };
  }

  const grantRoot = asString(item.grant_root, '').trim();
  const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
  const reason = asString(item.reason, '패치 적용을 위해 사용자 승인이 필요합니다.').trim();
  return {
    actionType: 'patch',
    callId,
    approvalId,
    command,
    reason,
    risk: inferCodexApprovalRisk(item),
  };
}

/**
 * Build the permission-router lookup key for a codex approval request.
 * Format: `${sessionId}:${approvalId || callId}`.
 */
export function buildCodexPermissionKey(
  sessionId: string,
  request: CodexPermissionRequest,
): string {
  return `${sessionId}:${request.approvalId || request.callId}`;
}

// ---------------------------------------------------------------------------
// File-write inference
// ---------------------------------------------------------------------------

type InferredFileWrite = {
  command: string;
  path?: string;
  detail?: string;
  status?: string;
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
};

/**
 * Infer a file-write event from a codex `item.completed` item payload.
 *
 * Handles `filechange`, `file_change`, `apply_patch`, `applypatch`, and
 * `patch` item types from both exec and app-server channels.
 *
 * Returns `null` when the item does not describe a file write.
 */
export function inferCodexFileWriteItem(item: Record<string, unknown>): InferredFileWrite | null {
  const itemType = asString(item.type, '').trim().toLowerCase();
  if (!itemType || itemType.includes('approval')) {
    return null;
  }
  if (itemType === 'agentmessage' || itemType === 'agent_message') {
    return null;
  }
  if (itemType === 'commandexecution' || itemType === 'command_execution') {
    return null;
  }

  const isFileWriteType =
    itemType.includes('filechange')
    || itemType.includes('file_change')
    || itemType.includes('apply_patch')
    || itemType.includes('applypatch')
    || itemType === 'patch';

  if (!isFileWriteType) {
    return null;
  }

  const pickPathFromArray = (value: unknown): string => {
    if (!Array.isArray(value)) {
      return '';
    }
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
      const rec = asRecord(entry);
      const candidate = asString(
        rec?.path,
        asString(
          rec?.file_path,
          asString(rec?.filePath, asString(rec?.target_path, asString(rec?.targetPath, ''))),
        ),
      ).trim();
      if (candidate) {
        return candidate;
      }
    }
    return '';
  };

  const pickDiffFromArray = (value: unknown): string => {
    if (!Array.isArray(value)) {
      return '';
    }
    const details: string[] = [];
    for (const entry of value) {
      const rec = asRecord(entry);
      if (!rec) {
        continue;
      }
      const candidate = asString(
        rec.diff,
        asString(
          rec.patch,
          asString(rec.unified_diff, asString(rec.unifiedDiff, asString(rec.text, asString(rec.result, '')))),
        ),
      ).trim();
      if (candidate) {
        details.push(candidate);
      }
    }
    return details.join('\n').trim();
  };

  const pickDiffStatsFromArray = (
    value: unknown,
  ): { additions: number; deletions: number; hasDiffSignal: boolean } => {
    if (!Array.isArray(value)) {
      return { additions: 0, deletions: 0, hasDiffSignal: false };
    }
    let additions = 0;
    let deletions = 0;
    let hasDiffSignal = false;
    for (const entry of value) {
      const rec = asRecord(entry);
      if (!rec) {
        continue;
      }
      const kind = asString(asRecord(rec.kind)?.type, asString(rec.kind, '')).trim();
      const candidate = asString(
        rec.diff,
        asString(
          rec.patch,
          asString(rec.unified_diff, asString(rec.unifiedDiff, asString(rec.text, asString(rec.result, '')))),
        ),
      ).trim();
      if (!candidate) {
        continue;
      }
      const stats = summarizeFileChangeDiff(candidate, kind);
      additions += stats.additions;
      deletions += stats.deletions;
      hasDiffSignal = hasDiffSignal || stats.hasDiffSignal;
    }
    return { additions, deletions, hasDiffSignal };
  };

  const arrayPath =
    pickPathFromArray(item.paths)
    || pickPathFromArray(item.files)
    || pickPathFromArray(item.changes)
    || pickPathFromArray(item.changed_files)
    || pickPathFromArray(item.changedFiles);

  const path = asString(
    item.path,
    asString(
      item.file_path,
      asString(
        item.filePath,
        asString(
          item.target_path,
          asString(
            item.targetPath,
            asString(item.relative_path, asString(item.relativePath, arrayPath)),
          ),
        ),
      ),
    ),
  ).trim() || undefined;

  const commandRaw = asString(item.command, '').trim();
  const command = unwrapShellCmd(commandRaw || 'apply_patch');

  const arrayDiff = pickDiffFromArray(item.changes);
  const detailRaw = stripAnsiSimple(
    asString(
      item.diff,
      asString(
        item.patch,
        asString(
          item.unified_diff,
          asString(
            item.unifiedDiff,
            asString(item.output, asString(item.text, asString(item.result, arrayDiff))),
          ),
        ),
      ),
    ),
  );
  const detail = detailRaw && detailRaw.toLowerCase() !== 'apply_patch' ? detailRaw : undefined;
  const status = asString(item.status, '').trim() || undefined;

  const directDiffStats = summarizeDiffText(detailRaw);
  const arrayDiffStats = pickDiffStatsFromArray(item.changes);
  const diffStats = directDiffStats.hasDiffSignal
    ? directDiffStats
    : arrayDiffStats.hasDiffSignal
      ? arrayDiffStats
      : directDiffStats;

  if (!path && !detail) {
    return null;
  }

  return { command, path, detail, status, ...diffStats };
}

// ---------------------------------------------------------------------------
// Thread-cache key
// ---------------------------------------------------------------------------

/**
 * Build the in-process thread-cache key for a codex session.
 *
 * Format: `${sessionId}:${chatId}` when chatId is provided,
 * otherwise just `${sessionId}`.
 */
export function buildCodexThreadCacheKey(sessionId: string, chatId?: string): string {
  if (chatId && chatId.trim().length > 0) {
    return `${sessionId}:${chatId.trim()}`;
  }
  return sessionId;
}

// ---------------------------------------------------------------------------
// Exec-channel pure mapper
// ---------------------------------------------------------------------------

/**
 * Parse a single `codex exec --json` stdout line into a `ParsedMessage`.
 *
 * Returns `null` for lines that produce no observable event (e.g. system
 * init frames, heartbeats, unrecognised payload types).
 *
 * This is the implementation of `CodexAdapter.parseStdout()` for the exec
 * channel.
 */
export function parseCodexExecLine(line: string): ParsedMessage | null {
  const payload = parseCodexJsonLine(line);
  if (!payload) {
    return null;
  }
  return mapCodexExecPayload(payload);
}

/**
 * Map a pre-parsed exec-channel payload to a `ParsedMessage`.
 *
 * Separated from `parseCodexExecLine` to support fixture-based testing
 * with already-parsed objects.
 */
export function mapCodexExecPayload(
  payload: Record<string, unknown>,
): ParsedMessage | null {
  const payloadType = asString(payload.type, '').trim();

  // Thread start — emit turn-start envelope + provider-state side effect.
  if (payloadType === 'thread.started') {
    const threadId = asString(payload.thread_id, '').trim();
    if (!threadId) {
      return null;
    }
    return {
      envelopes: [
        {
          kind: 'turn-start',
          provider: 'codex',
          source: 'system',
          threadId,
          threadIdSource: 'observed',
        },
      ],
      sideEffect: {
        type: 'update_provider_state',
        providerState: { threadId },
      },
    };
  }

  // Permission / approval request.
  const permissionRequest = extractCodexPermissionRequest(payload);
  if (permissionRequest) {
    return {
      envelopes: [],
      sideEffect: {
        type: 'request_permission',
        request: {
          callId: permissionRequest.callId,
          approvalId: permissionRequest.approvalId,
          command: permissionRequest.command,
          reason: permissionRequest.reason,
          risk: permissionRequest.risk,
        },
      },
    };
  }

  if (payloadType !== 'item.completed') {
    return null;
  }

  const item = asRecord(payload.item);
  if (!item) {
    return null;
  }

  const itemType = asString(item.type, '');

  // Agent message → text envelope.
  if (itemType === 'agent_message') {
    const rawText = asString(item.text, '').trim();
    const text = sanitizeAgentMessageText(rawText);
    if (!text) {
      return null;
    }
    const turnId =
      asString(
        payload.turn_id,
        asString(payload.turnId, asString(item.turn_id, asString(item.turnId, ''))),
      ).trim() || undefined;
    return {
      envelopes: [
        {
          kind: 'text',
          provider: 'codex',
          source: 'assistant',
          text,
          ...(turnId ? { turnId } : {}),
        },
      ],
    };
  }

  // File write → tool-call envelopes + emit_action side effect.
  const fileWrite = inferCodexFileWriteItem(item);
  if (fileWrite) {
    const bodyParts = [`$ ${fileWrite.command || 'apply_patch'}`];
    if (fileWrite.path) {
      bodyParts.push(`path: ${fileWrite.path}`);
    }
    if (fileWrite.detail) {
      bodyParts.push(fileWrite.detail);
    }
    if (shouldDisplayToolStatus(fileWrite.status)) {
      bodyParts.push(`status: ${fileWrite.status!}`);
    }

    const toolCallId = asString(item.call_id, asString(item.item_id, fileWrite.command)).trim();
    const action = {
      actionType: 'file_write' as const,
      title: titleForActionType('file_write'),
      command: fileWrite.command,
      path: fileWrite.path,
      additions: fileWrite.additions,
      deletions: fileWrite.deletions,
      hasDiffSignal: fileWrite.hasDiffSignal,
    };

    return {
      envelopes: [
        { kind: 'tool-call-start', provider: 'codex', source: 'tool', toolCallId, toolName: 'apply_patch', action },
        { kind: 'tool-call-end', provider: 'codex', source: 'tool', toolCallId, toolName: 'apply_patch', action, stopReason: 'completed' as SessionProtocolStopReason },
      ],
      sideEffect: { type: 'emit_action', action },
    };
  }

  // Command execution → tool-call envelopes + emit_action side effect.
  if (itemType === 'command_execution') {
    const commandRaw = asString(item.command, '').trim();
    const command = unwrapShellCmd(commandRaw);
    const output = stripAnsiSimple(asString(item.aggregated_output, ''));
    const exitCodeValue = item.exit_code;
    const exitCode =
      typeof exitCodeValue === 'number' && Number.isFinite(exitCodeValue)
        ? exitCodeValue
        : null;
    const actionType = inferActionTypeFromCommand(command);
    const diffStats =
      actionType === 'file_write'
        ? summarizeDiffText(output)
        : { additions: 0, deletions: 0, hasDiffSignal: false };
    const stopReason: SessionProtocolStopReason =
      exitCode !== null && exitCode !== 0 ? 'error' : 'completed';

    const action = {
      actionType,
      title: titleForActionType(actionType),
      command,
      output: output || undefined,
      additions: diffStats.additions,
      deletions: diffStats.deletions,
      hasDiffSignal: diffStats.hasDiffSignal,
      ...(exitCode !== null ? { meta: { exitCode } } : {}),
    };
    const toolCallId =
      asString(item.call_id, asString(item.item_id, command)).trim() || command;

    return {
      envelopes: [
        { kind: 'tool-call-start', provider: 'codex', source: 'tool', toolCallId, toolName: 'exec', action },
        { kind: 'tool-call-end', provider: 'codex', source: 'tool', toolCallId, toolName: 'exec', action, stopReason },
      ],
      sideEffect: { type: 'emit_action', action },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// App-server notification mapper
// ---------------------------------------------------------------------------

export type CodexAppServerMappedEvent = {
  /** Zero or more protocol envelopes to broadcast. */
  envelopes: ParsedMessage['envelopes'];
  /** Optional state-mutation descriptor for the caller to dispatch. */
  sideEffect?: ParsedMessage['sideEffect'];
  /**
   * Partial assistant text delta for streaming accumulation.
   * The caller appends this to a pending buffer; it is NOT yet persisted.
   */
  textDelta?: string;
};

/**
 * Map a codex app-server WebSocket notification (method + params already
 * parsed) to a structured event. Returns `null` for unknown/ignored methods.
 *
 * This covers the subset of app-server notifications that produce
 * observable events. Permission-request methods
 * (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`,
 * legacy `execCommandApproval` / `applyPatchApproval`) are handled
 * separately by `runtimeCore.ts` because they require JSON-RPC response
 * routing that depends on session context — those will be lifted in Sprint 5.
 */
export function mapCodexAppServerNotification(
  method: string,
  params: Record<string, unknown>,
): CodexAppServerMappedEvent | null {
  // Thread started.
  if (method === 'thread/started') {
    const threadRecord = asRecord(params.thread);
    const threadId = asString(threadRecord?.id, '').trim();
    if (!threadId) {
      return null;
    }
    return {
      envelopes: [
        {
          kind: 'turn-start',
          provider: 'codex',
          source: 'system',
          threadId,
          threadIdSource: 'observed',
        },
      ],
      sideEffect: {
        type: 'update_provider_state',
        providerState: { threadId },
      },
    };
  }

  // Streaming text delta (not yet final).
  if (method === 'item/agentMessage/delta') {
    const deltaRecord = asRecord(params.delta);
    const textDelta = asString(
      params.text,
      asString(params.delta, asString(deltaRecord?.text, asString(deltaRecord?.delta, ''))),
    );
    if (!textDelta) {
      return null;
    }
    return { envelopes: [], textDelta };
  }

  // Item completed.
  if (method === 'item/completed') {
    const item = asRecord(params.item);
    if (!item) {
      return null;
    }
    const itemType = asString(item.type, '');

    // Agent message (camelCase from app-server).
    if (itemType === 'agentMessage') {
      const rawText = asString(item.text, '').trim();
      const text = sanitizeAgentMessageText(rawText);
      if (!text) {
        return null;
      }
      const turnId = asString(params.turnId, '').trim() || undefined;
      return {
        envelopes: [
          {
            kind: 'text',
            provider: 'codex',
            source: 'assistant',
            text,
            ...(turnId ? { turnId } : {}),
          },
        ],
      };
    }

    // File write.
    const fileWrite = inferCodexFileWriteItem(item);
    if (fileWrite) {
      const bodyParts = [`$ ${fileWrite.command || 'apply_patch'}`];
      if (fileWrite.path) {
        bodyParts.push(`path: ${fileWrite.path}`);
      }
      if (fileWrite.detail) {
        bodyParts.push(fileWrite.detail);
      }
      if (shouldDisplayToolStatus(fileWrite.status)) {
        bodyParts.push(`status: ${fileWrite.status!}`);
      }
      const toolCallId = asString(item.call_id, asString(item.item_id, fileWrite.command)).trim();
      const action = {
        actionType: 'file_write' as const,
        title: titleForActionType('file_write'),
        command: fileWrite.command,
        path: fileWrite.path,
        additions: fileWrite.additions,
        deletions: fileWrite.deletions,
        hasDiffSignal: fileWrite.hasDiffSignal,
      };
      return {
        envelopes: [
          { kind: 'tool-call-start', provider: 'codex', source: 'tool', toolCallId, toolName: 'apply_patch', action },
          { kind: 'tool-call-end', provider: 'codex', source: 'tool', toolCallId, toolName: 'apply_patch', action, stopReason: 'completed' as SessionProtocolStopReason },
        ],
        sideEffect: { type: 'emit_action', action },
      };
    }

    // Command execution (camelCase from app-server).
    if (itemType === 'commandExecution') {
      const commandRaw = asString(item.command, '').trim();
      const command = unwrapShellCmd(commandRaw);
      const output = stripAnsiSimple(asString(item.aggregatedOutput, ''));
      const exitCodeValue = item.exitCode;
      const exitCode =
        typeof exitCodeValue === 'number' && Number.isFinite(exitCodeValue)
          ? exitCodeValue
          : null;
      const statusText = asString(item.status, '').trim();
      const actionType = inferActionTypeFromCommand(command);
      const diffStats =
        actionType === 'file_write'
          ? summarizeDiffText(output)
          : { additions: 0, deletions: 0, hasDiffSignal: false };
      const stopReason: SessionProtocolStopReason =
        exitCode !== null && exitCode !== 0 ? 'error' : 'completed';

      const action = {
        actionType,
        title: titleForActionType(actionType),
        command,
        output: output || undefined,
        additions: diffStats.additions,
        deletions: diffStats.deletions,
        hasDiffSignal: diffStats.hasDiffSignal,
        ...(exitCode !== null ? { meta: { exitCode } } : {}),
        ...(shouldDisplayToolStatus(statusText) ? { meta: { ...(exitCode !== null ? { exitCode } : {}), status: statusText } } : {}),
      };
      const toolCallId =
        asString(item.call_id, asString(item.item_id, command)).trim() || command;

      return {
        envelopes: [
          { kind: 'tool-call-start', provider: 'codex', source: 'tool', toolCallId, toolName: 'exec', action },
          { kind: 'tool-call-end', provider: 'codex', source: 'tool', toolCallId, toolName: 'exec', action, stopReason },
        ],
        sideEffect: { type: 'emit_action', action },
      };
    }

    return null;
  }

  // Turn completed.
  if (method === 'turn/completed') {
    const turn = asRecord(params.turn);
    const rawStatus = asString(turn?.status, '').trim();
    const errorMessage = asString(asRecord(turn?.error)?.message, '').trim() || undefined;
    const isError = rawStatus === 'failed' || rawStatus === 'error' || Boolean(errorMessage);
    const stopReason: SessionProtocolStopReason = isError ? 'error' : 'completed';

    return {
      envelopes: [
        {
          kind: 'turn-end',
          provider: 'codex',
          source: 'system',
          stopReason,
        },
      ],
      sideEffect: { type: 'turn_complete', reason: stopReason === 'error' ? 'error' : 'completed' },
    };
  }

  return null;
}
