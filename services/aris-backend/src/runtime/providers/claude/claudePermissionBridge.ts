import type { ProviderPermissionRequest } from '../../contracts/providerRuntime.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
}

function collectNestedRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const records: Record<string, unknown>[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const record = asRecord(current);
    if (!record) {
      continue;
    }
    records.push(record);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return records;
}

function extractFirstStringByKeys(records: Record<string, unknown>[], keys: string[]): string {
  for (const key of keys) {
    for (const record of records) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

function unwrapShellCommand(command: string): string {
  let current = command.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }

  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+([\s\S]+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+([\s\S]+)$/i];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) {
      continue;
    }
    const inner = match[1]?.trim() ?? '';
    if (
      (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
    ) {
      current = inner.slice(1, -1).trim();
    } else {
      current = inner;
    }
  }

  return current;
}

function inferRisk(payload: Record<string, unknown>): ProviderPermissionRequest['risk'] {
  const risk = typeof payload.risk === 'string' ? payload.risk.trim().toLowerCase() : '';
  if (risk === 'low' || risk === 'medium' || risk === 'high') {
    return risk;
  }

  const hasNetworkContext = asRecord(payload.network_approval_context) !== null
    || asRecord(payload.networkApprovalContext) !== null;
  const hasAdditionalPermissions = asRecord(payload.additional_permissions) !== null
    || asRecord(payload.additionalPermissions) !== null;
  const proposedAmendments = payload.proposed_network_policy_amendments ?? payload.proposedNetworkPolicyAmendments;
  const hasNetworkAmendments = Array.isArray(proposedAmendments) && proposedAmendments.length > 0;
  const grantRoot = typeof payload.grant_root === 'string' && payload.grant_root.trim().length > 0;

  return hasNetworkContext || hasAdditionalPermissions || hasNetworkAmendments || grantRoot
    ? 'high'
    : 'medium';
}

export function extractClaudePermissionRequest(line: string): ProviderPermissionRequest | null {
  const payload = parseJsonLine(line);
  if (!payload) {
    return null;
  }

  const payloadType = String(payload.type ?? '').trim().toLowerCase();
  const payloadSubtype = String(payload.subtype ?? '').trim().toLowerCase();
  const lineLower = line.toLowerCase();
  const records = collectNestedRecords(payload);

  const looksLikePermissionEvent = (
    payloadType.includes('approval')
    || payloadType.includes('permission')
    || payloadSubtype.includes('approval')
    || payloadSubtype.includes('permission')
    || lineLower.includes('requestapproval')
    || lineLower.includes('approval_request')
    || lineLower.includes('permission_request')
  );
  if (!looksLikePermissionEvent) {
    return null;
  }

  const callId = extractFirstStringByKeys(records, [
    'approvalId',
    'approval_id',
    'callId',
    'call_id',
    'itemId',
    'item_id',
    'requestId',
    'request_id',
  ]);
  if (!callId) {
    return null;
  }

  const rawCommand = extractFirstStringByKeys(records, [
    'command',
    'cmd',
    'parsed_cmd',
    'shellCommand',
    'shell_command',
    'interaction_input',
  ]);
  const grantRoot = extractFirstStringByKeys(records, ['grantRoot', 'grant_root']);
  const command = rawCommand
    ? unwrapShellCommand(rawCommand)
    : grantRoot
      ? `apply_patch (grant_root: ${grantRoot})`
      : `claude permission (${callId})`;
  const reason = extractFirstStringByKeys(records, ['reason', 'message', 'description'])
    || 'Claude 실행을 위해 사용자 승인이 필요합니다.';
  const approvalId = extractFirstStringByKeys(records, ['approvalId', 'approval_id']) || undefined;

  return {
    callId,
    approvalId,
    command,
    reason,
    risk: inferRisk(payload),
  };
}
