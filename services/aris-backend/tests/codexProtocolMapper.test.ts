import { describe, expect, it } from 'vitest';
import {
  buildCodexPermissionKey,
  buildCodexThreadCacheKey,
  classifyCodexAppServerFailure,
  extractCodexPermissionRequest,
  inferCodexFileWriteItem,
  isMissingCodexThreadError,
  mapCodexAppServerNotification,
  mapCodexExecPayload,
  parseCodexExecLine,
} from '../src/runtime/providers/codex/codexProtocolMapper.js';

// ---------------------------------------------------------------------------
// Fixtures — synthetic codex payloads representative of real protocol output
// ---------------------------------------------------------------------------

const FIXTURES = {
  // Scenario 1: thread start (exec channel)
  execThreadStarted: {
    type: 'thread.started',
    thread_id: 'thread-abc-123',
  },

  // Scenario 2: assistant text (exec channel)
  execAgentMessage: {
    type: 'item.completed',
    turn_id: 'turn-001',
    item: {
      type: 'agent_message',
      text: 'Sure, I can help with that!',
    },
  },

  // Scenario 3: file write (exec channel) — unified diff format
  execFileChange: {
    type: 'item.completed',
    item: {
      type: 'file_change',
      path: 'src/index.ts',
      diff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-const x = 0;\n+const x = 1;',
      status: 'completed',
    },
  },

  // Scenario 4: permission request — exec approval (exec channel)
  execApprovalRequest: {
    type: 'item.completed',
    item: {
      type: 'exec_approval_request',
      call_id: 'call-42',
      command: 'npm install',
      reason: '의존성 설치가 필요합니다.',
    },
  },

  // Scenario 5a: missing-thread error message
  missingThreadError: new Error('thread not found: abc-123'),

  // Scenario 5b: context-window error
  contextWindowError: new Error('ran out of room in the context window'),

  // App-server scenarios
  appServerThreadStarted: {
    thread: { id: 'thread-ws-999' },
  },

  appServerAgentMessageDelta: {
    text: 'Hello ',
  },

  appServerItemCompleted_agentMessage: {
    item: {
      type: 'agentMessage',
      text: 'Final answer.',
    },
    turnId: 'turn-ws-001',
  },

  appServerTurnCompleted: {
    turn: {
      id: 'turn-ws-001',
      status: 'completed',
    },
  },

  appServerTurnFailed: {
    turn: {
      id: 'turn-ws-002',
      status: 'failed',
      error: { message: 'turn failed: rate limit exceeded' },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// isMissingCodexThreadError
// ---------------------------------------------------------------------------

describe('isMissingCodexThreadError', () => {
  it('returns true for "thread not found" messages', () => {
    expect(isMissingCodexThreadError(new Error('thread not found: abc'))).toBe(true);
    expect(isMissingCodexThreadError(new Error('Thread does not exist'))).toBe(true);
    expect(isMissingCodexThreadError(new Error('session unknown'))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingCodexThreadError(new Error('network timeout'))).toBe(false);
    expect(isMissingCodexThreadError(new Error('permission denied'))).toBe(false);
  });

  it('handles non-Error inputs', () => {
    expect(isMissingCodexThreadError('thread invalid abc')).toBe(true);
    expect(isMissingCodexThreadError('something else')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyCodexAppServerFailure
// ---------------------------------------------------------------------------

describe('classifyCodexAppServerFailure', () => {
  it('classifies missing-thread errors', () => {
    const info = classifyCodexAppServerFailure(FIXTURES.missingThreadError);
    expect(info.kind).toBe('missing_thread');
    expect(info.clearCachedThread).toBe(true);
    expect(info.retryWithFreshThread).toBe(true);
  });

  it('classifies context-window errors', () => {
    const info = classifyCodexAppServerFailure(FIXTURES.contextWindowError);
    expect(info.kind).toBe('context_window');
    expect(info.clearCachedThread).toBe(true);
    expect(info.retryWithFreshThread).toBe(true);
  });

  it('classifies websocket connect errors', () => {
    const err = new Error('timed out waiting for codex app-server websocket');
    const info = classifyCodexAppServerFailure(err);
    expect(info.kind).toBe('websocket_connect');
    expect(info.clearCachedThread).toBe(false);
  });

  it('classifies aborted errors', () => {
    const err = new Error('aborted');
    (err as NodeJS.ErrnoException).name = 'AbortError';
    const info = classifyCodexAppServerFailure(err);
    expect(info.kind).toBe('aborted');
    expect(info.retryWithFreshThread).toBe(false);
  });

  it('falls back to "other" for unrecognised messages', () => {
    const info = classifyCodexAppServerFailure(new Error('unknown error xyz'));
    expect(info.kind).toBe('other');
    expect(info.clearCachedThread).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractCodexPermissionRequest
// ---------------------------------------------------------------------------

describe('extractCodexPermissionRequest', () => {
  it('extracts exec approval from item.completed wrapper', () => {
    const req = extractCodexPermissionRequest(FIXTURES.execApprovalRequest as Record<string, unknown>);
    expect(req).not.toBeNull();
    expect(req!.actionType).toBe('exec');
    expect(req!.callId).toBe('call-42');
    expect(req!.command).toBe('npm install');
    expect(req!.reason).toBe('의존성 설치가 필요합니다.');
  });

  it('extracts patch approval from direct payload', () => {
    const payload = {
      type: 'apply_patch_approval_request',
      call_id: 'call-patch-7',
      grant_root: '/workspace/src',
      reason: '패치 적용이 필요합니다.',
    };
    const req = extractCodexPermissionRequest(payload);
    expect(req).not.toBeNull();
    expect(req!.actionType).toBe('patch');
    expect(req!.callId).toBe('call-patch-7');
    expect(req!.risk).toBe('high');
  });

  it('returns null for non-approval payloads', () => {
    expect(extractCodexPermissionRequest(FIXTURES.execAgentMessage as Record<string, unknown>)).toBeNull();
    expect(extractCodexPermissionRequest({ type: 'thread.started' })).toBeNull();
  });

  it('returns null when callId is missing', () => {
    const payload = { type: 'exec_approval_request', command: 'ls' };
    expect(extractCodexPermissionRequest(payload)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inferCodexFileWriteItem
// ---------------------------------------------------------------------------

describe('inferCodexFileWriteItem', () => {
  it('infers from file_change item', () => {
    const result = inferCodexFileWriteItem({
      type: 'file_change',
      path: 'src/foo.ts',
      diff: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,2 +1,3 @@\n+const a = 1;\n+const b = 2;\n-const c = 3;',
    });
    expect(result).not.toBeNull();
    expect(result!.path).toBe('src/foo.ts');
    expect(result!.additions).toBeGreaterThan(0);
    expect(result!.deletions).toBeGreaterThan(0);
    expect(result!.hasDiffSignal).toBe(true);
  });

  it('infers from apply_patch item', () => {
    const result = inferCodexFileWriteItem({
      type: 'apply_patch',
      path: 'README.md',
    });
    expect(result).not.toBeNull();
  });

  it('returns null for agent_message items', () => {
    expect(inferCodexFileWriteItem({ type: 'agent_message', text: 'hi' })).toBeNull();
  });

  it('returns null for approval items', () => {
    expect(inferCodexFileWriteItem({ type: 'exec_approval_request' })).toBeNull();
  });

  it('returns null when neither path nor diff is present', () => {
    expect(inferCodexFileWriteItem({ type: 'file_change' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildCodexPermissionKey / buildCodexThreadCacheKey
// ---------------------------------------------------------------------------

describe('buildCodexPermissionKey', () => {
  it('uses approvalId when present', () => {
    const req = { actionType: 'exec' as const, callId: 'c1', approvalId: 'a1', command: '', reason: '', risk: 'medium' as const };
    expect(buildCodexPermissionKey('session-1', req)).toBe('session-1:a1');
  });

  it('falls back to callId when approvalId is absent', () => {
    const req = { actionType: 'exec' as const, callId: 'c2', command: '', reason: '', risk: 'medium' as const };
    expect(buildCodexPermissionKey('session-1', req)).toBe('session-1:c2');
  });
});

describe('buildCodexThreadCacheKey', () => {
  it('includes chatId when provided', () => {
    expect(buildCodexThreadCacheKey('sess-1', 'chat-1')).toBe('sess-1:chat-1');
  });

  it('returns sessionId alone when chatId is absent', () => {
    expect(buildCodexThreadCacheKey('sess-1')).toBe('sess-1');
    expect(buildCodexThreadCacheKey('sess-1', '')).toBe('sess-1');
  });
});

// ---------------------------------------------------------------------------
// Scenario 1: exec thread start → ParsedMessage
// ---------------------------------------------------------------------------

describe('mapCodexExecPayload — scenario 1: thread start', () => {
  it('emits turn-start envelope with threadId', () => {
    const msg = mapCodexExecPayload(FIXTURES.execThreadStarted as Record<string, unknown>);
    expect(msg).not.toBeNull();
    expect(msg!.envelopes).toHaveLength(1);
    const env = msg!.envelopes[0];
    expect(env.kind).toBe('turn-start');
    expect('threadId' in env && env.threadId).toBe('thread-abc-123');
  });

  it('emits update_provider_state side effect', () => {
    const msg = mapCodexExecPayload(FIXTURES.execThreadStarted as Record<string, unknown>);
    expect(msg!.sideEffect?.type).toBe('update_provider_state');
    if (msg!.sideEffect?.type === 'update_provider_state') {
      expect(msg!.sideEffect.providerState.threadId).toBe('thread-abc-123');
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: exec assistant text → ParsedMessage
// ---------------------------------------------------------------------------

describe('mapCodexExecPayload — scenario 2: assistant text', () => {
  it('emits text envelope with correct content', () => {
    const msg = mapCodexExecPayload(FIXTURES.execAgentMessage as Record<string, unknown>);
    expect(msg).not.toBeNull();
    expect(msg!.envelopes).toHaveLength(1);
    const env = msg!.envelopes[0];
    expect(env.kind).toBe('text');
    expect('text' in env && env.text).toBe('Sure, I can help with that!');
    expect('source' in env && env.source).toBe('assistant');
  });

  it('carries turnId from payload when present', () => {
    const msg = mapCodexExecPayload(FIXTURES.execAgentMessage as Record<string, unknown>);
    const env = msg!.envelopes[0];
    expect('turnId' in env && env.turnId).toBe('turn-001');
  });

  it('produces no side effect for plain text', () => {
    const msg = mapCodexExecPayload(FIXTURES.execAgentMessage as Record<string, unknown>);
    expect(msg!.sideEffect).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: exec file write → ParsedMessage
// ---------------------------------------------------------------------------

describe('mapCodexExecPayload — scenario 3: file write', () => {
  it('emits tool-call-start and tool-call-end envelopes', () => {
    const msg = mapCodexExecPayload(FIXTURES.execFileChange as Record<string, unknown>);
    expect(msg).not.toBeNull();
    expect(msg!.envelopes).toHaveLength(2);
    expect(msg!.envelopes[0].kind).toBe('tool-call-start');
    expect(msg!.envelopes[1].kind).toBe('tool-call-end');
  });

  it('emits emit_action side effect with file_write actionType', () => {
    const msg = mapCodexExecPayload(FIXTURES.execFileChange as Record<string, unknown>);
    expect(msg!.sideEffect?.type).toBe('emit_action');
    if (msg!.sideEffect?.type === 'emit_action') {
      expect(msg!.sideEffect.action.actionType).toBe('file_write');
      expect(msg!.sideEffect.action.path).toBe('src/index.ts');
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: exec permission request → ParsedMessage
// ---------------------------------------------------------------------------

describe('mapCodexExecPayload — scenario 4: permission request', () => {
  it('emits empty envelopes and request_permission side effect', () => {
    const msg = mapCodexExecPayload(FIXTURES.execApprovalRequest as Record<string, unknown>);
    expect(msg).not.toBeNull();
    expect(msg!.envelopes).toHaveLength(0);
    expect(msg!.sideEffect?.type).toBe('request_permission');
  });

  it('includes callId and command in the request', () => {
    const msg = mapCodexExecPayload(FIXTURES.execApprovalRequest as Record<string, unknown>);
    if (msg!.sideEffect?.type === 'request_permission') {
      expect(msg!.sideEffect.request.callId).toBe('call-42');
      expect(msg!.sideEffect.request.command).toBe('npm install');
    }
  });
});

// ---------------------------------------------------------------------------
// parseCodexExecLine (string input)
// ---------------------------------------------------------------------------

describe('parseCodexExecLine', () => {
  it('returns null for invalid JSON', () => {
    expect(parseCodexExecLine('not json')).toBeNull();
    expect(parseCodexExecLine('')).toBeNull();
  });

  it('returns null for unrecognised payload types', () => {
    expect(parseCodexExecLine('{"type":"response.created"}')).toBeNull();
  });

  it('parses thread.started from raw line', () => {
    const line = JSON.stringify(FIXTURES.execThreadStarted);
    const msg = parseCodexExecLine(line);
    expect(msg).not.toBeNull();
    expect(msg!.envelopes[0].kind).toBe('turn-start');
  });
});

// ---------------------------------------------------------------------------
// App-server notification mapper
// ---------------------------------------------------------------------------

describe('mapCodexAppServerNotification — thread/started', () => {
  it('emits turn-start envelope with threadId', () => {
    const result = mapCodexAppServerNotification(
      'thread/started',
      FIXTURES.appServerThreadStarted as Record<string, unknown>,
    );
    expect(result).not.toBeNull();
    expect(result!.envelopes[0].kind).toBe('turn-start');
    const env = result!.envelopes[0];
    expect('threadId' in env && env.threadId).toBe('thread-ws-999');
  });
});

describe('mapCodexAppServerNotification — item/agentMessage/delta', () => {
  it('returns textDelta for streaming text', () => {
    const result = mapCodexAppServerNotification(
      'item/agentMessage/delta',
      FIXTURES.appServerAgentMessageDelta as Record<string, unknown>,
    );
    expect(result).not.toBeNull();
    expect(result!.textDelta).toBe('Hello ');
    expect(result!.envelopes).toHaveLength(0);
  });
});

describe('mapCodexAppServerNotification — item/completed (agentMessage)', () => {
  it('emits text envelope', () => {
    const result = mapCodexAppServerNotification(
      'item/completed',
      FIXTURES.appServerItemCompleted_agentMessage as Record<string, unknown>,
    );
    expect(result).not.toBeNull();
    expect(result!.envelopes[0].kind).toBe('text');
    const env = result!.envelopes[0];
    expect('text' in env && env.text).toBe('Final answer.');
  });
});

describe('mapCodexAppServerNotification — turn/completed', () => {
  it('emits turn-end envelope with "completed" stopReason', () => {
    const result = mapCodexAppServerNotification(
      'turn/completed',
      FIXTURES.appServerTurnCompleted as Record<string, unknown>,
    );
    expect(result).not.toBeNull();
    expect(result!.envelopes[0].kind).toBe('turn-end');
    const env = result!.envelopes[0];
    expect('stopReason' in env && env.stopReason).toBe('completed');
  });

  it('emits turn-end with "error" stopReason for failed turns', () => {
    const result = mapCodexAppServerNotification(
      'turn/completed',
      FIXTURES.appServerTurnFailed as Record<string, unknown>,
    );
    expect(result).not.toBeNull();
    const env = result!.envelopes[0];
    expect('stopReason' in env && env.stopReason).toBe('error');
  });

  it('emits turn_complete side effect', () => {
    const result = mapCodexAppServerNotification(
      'turn/completed',
      FIXTURES.appServerTurnCompleted as Record<string, unknown>,
    );
    expect(result!.sideEffect?.type).toBe('turn_complete');
  });
});

describe('mapCodexAppServerNotification — unknown method', () => {
  it('returns null for unhandled methods', () => {
    expect(mapCodexAppServerNotification('unknown/method', {})).toBeNull();
    expect(mapCodexAppServerNotification('mcpServer/elicitation/request', {})).toBeNull();
  });
});
