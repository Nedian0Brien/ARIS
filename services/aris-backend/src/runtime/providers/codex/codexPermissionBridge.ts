/**
 * Codex permission bridge — pure functions for the app-server approval channel.
 *
 * The codex `app-server` process sends JSON-RPC requests to ARIS when it
 * needs user approval for a command, patch, legacy MCP review, or MCP tool
 * elicitation. This
 * module owns:
 *   - Extracting structured approval data (key, command, reason, risk, and
 *     a decision mapper) from supported approval methods.
 *   - Mapping ARIS's internal `PermissionDecision` enum back to the
 *     channel-specific response token codex expects.
 *   - Narrowing the user-visible approval-policy enum down to the three
 *     values codex itself accepts.
 *
 * No I/O, no state, no JSON-RPC writes — the caller in `runtimeCore.ts`
 * handles the actual `sendJsonRpcResult` dispatch and permission router
 * binding. Extracting these pure transformations matches the
 * `claudePermissionBridge.ts` pattern.
 *
 * Phase 2 Sprint 5.
 */

import type { ApprovalPolicy, PermissionDecision, PermissionRisk } from '../../../types.js';

// ---------------------------------------------------------------------------
// Pure utilities (mirror those in codexProtocolMapper.ts)
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

// ---------------------------------------------------------------------------
// Approval-policy normalisation
// ---------------------------------------------------------------------------

/**
 * Narrow ARIS's `ApprovalPolicy` enum down to the three values codex
 * itself accepts: `on-request`, `on-failure`, `never`.
 *
 * The user-visible `yolo` value short-circuits the approval flow at a
 * higher layer (auto-approve in the runtime), so it never reaches codex.
 */
export function normalizeCodexApprovalPolicy(
  value: ApprovalPolicy,
): 'on-request' | 'on-failure' | 'never' {
  if (value === 'on-failure' || value === 'never' || value === 'on-request') {
    return value;
  }
  return 'on-request';
}

// ---------------------------------------------------------------------------
// Decision → JSON-RPC response token
// ---------------------------------------------------------------------------

/** Map a permission decision to the response token for `item/commandExecution/requestApproval`. */
export function mapCodexDecisionForCommandApproval(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'acceptForSession';
  }
  if (decision === 'deny') {
    return 'decline';
  }
  return 'accept';
}

/** Map a permission decision to the response token for `item/fileChange/requestApproval`. */
export function mapCodexDecisionForPatchApproval(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'acceptForSession';
  }
  if (decision === 'deny') {
    return 'decline';
  }
  return 'accept';
}

/** Map a permission decision to the legacy `execCommandApproval` / `applyPatchApproval` response token. */
export function mapCodexDecisionForLegacyReview(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'approved_for_session';
  }
  if (decision === 'deny') {
    return 'denied';
  }
  return 'approved';
}

export type CodexMcpElicitationResult = {
  action: 'accept' | 'accept_session' | 'decline';
  content: Record<string, unknown> | null;
};

/** Map a permission decision to the response shape for `mcpServer/elicitation/request`. */
export function mapCodexDecisionForMcpElicitation(decision: PermissionDecision): CodexMcpElicitationResult {
  if (decision === 'allow_session') {
    return { action: 'accept_session', content: {} };
  }
  if (decision === 'deny') {
    return { action: 'decline', content: null };
  }
  return { action: 'accept', content: {} };
}

// ---------------------------------------------------------------------------
// Approval-request extraction
// ---------------------------------------------------------------------------

function extractMcpToolName(message: string): string {
  const match = message.match(/\btool\s+"([^"]+)"/i);
  return match?.[1]?.trim() || 'tool';
}

/**
 * Result shape produced by `extractCodexAppServerApproval`.
 *
 * `permissionKey` is the *raw* router key (`${sessionId}:${kind}:${id}`).
 * The caller is responsible for wrapping it with `buildScopedPermissionKey`
 * to add chat scoping when applicable.
 */
export type CodexAppServerApprovalRequest = {
  permissionKey: string;
  command: string;
  reason: string;
  risk: PermissionRisk;
  mapDecision: (decision: PermissionDecision) => string;
};

export type CodexMcpElicitationApprovalRequest = Omit<CodexAppServerApprovalRequest, 'mapDecision'> & {
  mapDecision: (decision: PermissionDecision) => CodexMcpElicitationResult;
};

/**
 * Extract a structured approval request from a codex app-server JSON-RPC
 * method/params pair. Returns `null` if the method is not one of the four
 * supported approval channels.
 *
 * Supported methods:
 *   - `item/commandExecution/requestApproval` — modern command approval
 *   - `item/fileChange/requestApproval`       — modern patch approval
 *   - `execCommandApproval`                   — legacy MCP review (command)
 *   - `applyPatchApproval`                    — legacy MCP review (patch)
 */
export function extractCodexAppServerApproval(input: {
  method: string;
  params: Record<string, unknown>;
  requestIdKey: string;
  sessionId: string;
}): CodexAppServerApprovalRequest | null {
  const { method, params, requestIdKey, sessionId } = input;

  if (method === 'item/commandExecution/requestApproval') {
    const itemId = asString(params.itemId, '').trim();
    const approvalId = asString(params.approvalId, '').trim();
    const callId = approvalId || itemId || requestIdKey;
    const commandRaw = asString(params.command, `command (${callId})`);
    const reason = asString(
      params.reason,
      '명령 실행을 위해 사용자 승인이 필요합니다.',
    ).trim();
    const hasNetworkContext = asRecord(params.networkApprovalContext) !== null;
    const hasAdditionalPermissions = asRecord(params.additionalPermissions) !== null;
    const hasNetworkAmendments =
      Array.isArray(params.proposedNetworkPolicyAmendments)
      && params.proposedNetworkPolicyAmendments.length > 0;
    const risk: PermissionRisk =
      hasNetworkContext || hasAdditionalPermissions || hasNetworkAmendments
        ? 'high'
        : 'medium';
    return {
      permissionKey: `${sessionId}:cmd:${approvalId || itemId || requestIdKey}`,
      command: unwrapShellCmd(commandRaw),
      reason,
      risk,
      mapDecision: mapCodexDecisionForCommandApproval,
    };
  }

  if (method === 'item/fileChange/requestApproval') {
    const itemId = asString(params.itemId, '').trim();
    const grantRoot = asString(params.grantRoot, '').trim();
    const reason = asString(
      params.reason,
      '패치 적용을 위해 사용자 승인이 필요합니다.',
    ).trim();
    const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
    return {
      permissionKey: `${sessionId}:patch:${itemId || requestIdKey}`,
      command,
      reason,
      risk: grantRoot ? 'high' : 'medium',
      mapDecision: mapCodexDecisionForPatchApproval,
    };
  }

  if (method === 'execCommandApproval') {
    const callId = asString(params.callId, requestIdKey).trim();
    const approvalId = asString(params.approvalId, '').trim();
    const commandParts = Array.isArray(params.command)
      ? params.command.filter((part): part is string => typeof part === 'string')
      : [];
    const command =
      commandParts.length > 0
        ? commandParts.join(' ')
        : `exec command (${callId})`;
    const reason = asString(
      params.reason,
      '명령 실행을 위해 사용자 승인이 필요합니다.',
    ).trim();
    return {
      permissionKey: `${sessionId}:legacy-exec:${approvalId || callId}`,
      command: unwrapShellCmd(command),
      reason,
      risk: 'medium',
      mapDecision: mapCodexDecisionForLegacyReview,
    };
  }

  if (method === 'applyPatchApproval') {
    const callId = asString(params.callId, requestIdKey).trim();
    const grantRoot = asString(params.grantRoot, '').trim();
    const reason = asString(
      params.reason,
      '패치 적용을 위해 사용자 승인이 필요합니다.',
    ).trim();
    const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
    return {
      permissionKey: `${sessionId}:legacy-patch:${callId}`,
      command,
      reason,
      risk: grantRoot ? 'high' : 'medium',
      mapDecision: mapCodexDecisionForLegacyReview,
    };
  }

  return null;
}

export function extractCodexMcpElicitationApproval(input: {
  method: string;
  params: Record<string, unknown>;
  requestIdKey: string;
  sessionId: string;
}): CodexMcpElicitationApprovalRequest | null {
  const { method, params, requestIdKey, sessionId } = input;
  if (method !== 'mcpServer/elicitation/request') {
    return null;
  }

  const serverName = asString(params.serverName, 'mcp').trim() || 'mcp';
  const message = asString(
    params.message,
    `Allow the ${serverName} MCP server to run a tool?`,
  ).trim();
  const toolName = extractMcpToolName(message);

  return {
    permissionKey: `${sessionId}:mcp:${serverName}:${toolName}:${requestIdKey}`,
    command: `MCP ${serverName}.${toolName}`,
    reason: message,
    risk: 'medium',
    mapDecision: mapCodexDecisionForMcpElicitation,
  };
}
