import { describe, expect, it } from 'vitest';
import {
  extractCodexAppServerApproval,
  mapCodexDecisionForCommandApproval,
  mapCodexDecisionForLegacyReview,
  mapCodexDecisionForPatchApproval,
  normalizeCodexApprovalPolicy,
} from '../src/runtime/providers/codex/codexPermissionBridge.js';

const SID = 'session-abc';
const RID = 'rpc-99';

describe('normalizeCodexApprovalPolicy', () => {
  it('passes through codex-supported values', () => {
    expect(normalizeCodexApprovalPolicy('on-request')).toBe('on-request');
    expect(normalizeCodexApprovalPolicy('on-failure')).toBe('on-failure');
    expect(normalizeCodexApprovalPolicy('never')).toBe('never');
  });

  it('falls back to on-request for yolo (auto-approve handled upstream)', () => {
    expect(normalizeCodexApprovalPolicy('yolo')).toBe('on-request');
  });
});

describe('mapCodexDecisionFor* — modern channels', () => {
  it('command approval maps allow→accept, allow_session→acceptForSession, deny→decline', () => {
    expect(mapCodexDecisionForCommandApproval('allow')).toBe('accept');
    expect(mapCodexDecisionForCommandApproval('allow_session')).toBe('acceptForSession');
    expect(mapCodexDecisionForCommandApproval('deny')).toBe('decline');
  });

  it('patch approval shares the same token set', () => {
    expect(mapCodexDecisionForPatchApproval('allow')).toBe('accept');
    expect(mapCodexDecisionForPatchApproval('allow_session')).toBe('acceptForSession');
    expect(mapCodexDecisionForPatchApproval('deny')).toBe('decline');
  });
});

describe('mapCodexDecisionForLegacyReview', () => {
  it('legacy review uses approved/denied/approved_for_session', () => {
    expect(mapCodexDecisionForLegacyReview('allow')).toBe('approved');
    expect(mapCodexDecisionForLegacyReview('allow_session')).toBe('approved_for_session');
    expect(mapCodexDecisionForLegacyReview('deny')).toBe('denied');
  });
});

describe('extractCodexAppServerApproval — item/commandExecution/requestApproval', () => {
  it('extracts command + risk=medium for plain commands', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/commandExecution/requestApproval',
      params: { itemId: 'i1', approvalId: 'a1', command: 'ls -la', reason: 'list files' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval).not.toBeNull();
    expect(approval!.permissionKey).toBe(`${SID}:cmd:a1`);
    expect(approval!.command).toBe('ls -la');
    expect(approval!.reason).toBe('list files');
    expect(approval!.risk).toBe('medium');
    expect(approval!.mapDecision('allow_session')).toBe('acceptForSession');
  });

  it('escalates risk to high when network context is present', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/commandExecution/requestApproval',
      params: { command: 'curl example.com', networkApprovalContext: { domain: 'example.com' } },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.risk).toBe('high');
  });

  it('unwraps bash -lc wrappers', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/commandExecution/requestApproval',
      params: { itemId: 'i1', command: 'bash -lc "ls -la"' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.command).toBe('ls -la');
  });

  it('falls back to requestIdKey when ids missing', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/commandExecution/requestApproval',
      params: { command: 'pwd' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.permissionKey).toBe(`${SID}:cmd:${RID}`);
  });
});

describe('extractCodexAppServerApproval — item/fileChange/requestApproval', () => {
  it('uses default reason and risk=medium without grant_root', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/fileChange/requestApproval',
      params: { itemId: 'item-7' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.permissionKey).toBe(`${SID}:patch:item-7`);
    expect(approval!.command).toBe('apply_patch');
    expect(approval!.risk).toBe('medium');
    expect(approval!.mapDecision('deny')).toBe('decline');
  });

  it('escalates to high risk when grantRoot is supplied', () => {
    const approval = extractCodexAppServerApproval({
      method: 'item/fileChange/requestApproval',
      params: { itemId: 'item-7', grantRoot: '/workspace' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.risk).toBe('high');
    expect(approval!.command).toBe('apply_patch (grant_root: /workspace)');
  });
});

describe('extractCodexAppServerApproval — legacy execCommandApproval', () => {
  it('joins string-array command and uses legacy decision tokens', () => {
    const approval = extractCodexAppServerApproval({
      method: 'execCommandApproval',
      params: { callId: 'c-1', command: ['rm', '-rf', '/tmp/foo'] },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.permissionKey).toBe(`${SID}:legacy-exec:c-1`);
    expect(approval!.command).toBe('rm -rf /tmp/foo');
    expect(approval!.mapDecision('allow_session')).toBe('approved_for_session');
  });
});

describe('extractCodexAppServerApproval — legacy applyPatchApproval', () => {
  it('builds patch command and uses legacy decision tokens', () => {
    const approval = extractCodexAppServerApproval({
      method: 'applyPatchApproval',
      params: { callId: 'c-2', grantRoot: '/repo' },
      requestIdKey: RID,
      sessionId: SID,
    });
    expect(approval!.permissionKey).toBe(`${SID}:legacy-patch:c-2`);
    expect(approval!.command).toBe('apply_patch (grant_root: /repo)');
    expect(approval!.risk).toBe('high');
    expect(approval!.mapDecision('allow')).toBe('approved');
  });
});

describe('extractCodexAppServerApproval — unknown methods', () => {
  it('returns null for non-approval methods', () => {
    expect(extractCodexAppServerApproval({
      method: 'thread/started',
      params: {},
      requestIdKey: RID,
      sessionId: SID,
    })).toBeNull();

    expect(extractCodexAppServerApproval({
      method: 'mcpServer/elicitation/request',
      params: {},
      requestIdKey: RID,
      sessionId: SID,
    })).toBeNull();
  });
});
