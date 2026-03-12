import { describe, expect, it } from 'vitest';
import { extractClaudePermissionRequest } from '../src/runtime/providers/claude/claudePermissionBridge.js';

describe('claudePermissionBridge', () => {
  it('extracts Claude command approval requests from stream-json lines', () => {
    const request = extractClaudePermissionRequest(JSON.stringify({
      type: 'permission_request',
      subtype: 'command_execution',
      approval_id: 'approval-1',
      command: 'npm install sharp',
      reason: 'Native dependency install requires approval',
      additional_permissions: {
        network: true,
      },
    }));

    expect(request).toEqual({
      callId: 'approval-1',
      approvalId: 'approval-1',
      command: 'npm install sharp',
      reason: 'Native dependency install requires approval',
      risk: 'high',
    });
  });

  it('extracts patch approvals when Claude only provides grant_root metadata', () => {
    const request = extractClaudePermissionRequest(JSON.stringify({
      type: 'event',
      subtype: 'requestApproval',
      itemId: 'patch-1',
      grant_root: '/workspace/project',
      reason: 'Patch needs write access',
    }));

    expect(request).toEqual({
      callId: 'patch-1',
      approvalId: undefined,
      command: 'apply_patch (grant_root: /workspace/project)',
      reason: 'Patch needs write access',
      risk: 'high',
    });
  });
});
