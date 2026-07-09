import { describe, expect, it } from 'vitest';
import {
  parseProjectSyncLeaderRecord,
  SESSION_SYNC_LEADER_STALE_MS,
  shouldClaimProjectSyncLeadership,
} from '@/lib/hooks/useProjectSyncLeader';

describe('session sync leader helpers', () => {
  it('parses a valid leader record', () => {
    expect(parseProjectSyncLeaderRecord(JSON.stringify({
      tabId: 'tab-a',
      updatedAt: 123,
      focused: true,
    }))).toEqual({
      tabId: 'tab-a',
      updatedAt: 123,
      focused: true,
    });
  });

  it('rejects malformed leader records', () => {
    expect(parseProjectSyncLeaderRecord(null)).toBeNull();
    expect(parseProjectSyncLeaderRecord('invalid-json')).toBeNull();
    expect(parseProjectSyncLeaderRecord(JSON.stringify({ tabId: '', updatedAt: 1, focused: true }))).toBeNull();
    expect(parseProjectSyncLeaderRecord(JSON.stringify({ tabId: 'tab-a', updatedAt: '1', focused: true }))).toBeNull();
  });

  it('claims leadership when there is no active leader', () => {
    expect(shouldClaimProjectSyncLeadership(null, 1_000, 'tab-a', true, true)).toBe(true);
  });

  it('does not claim leadership when the tab is hidden', () => {
    expect(shouldClaimProjectSyncLeadership(null, 1_000, 'tab-a', false, false)).toBe(false);
  });

  it('keeps the current focused leader when it is still fresh', () => {
    expect(shouldClaimProjectSyncLeadership({
      tabId: 'tab-b',
      updatedAt: 10_000,
      focused: true,
    }, 10_000 + SESSION_SYNC_LEADER_STALE_MS - 1, 'tab-a', true, true)).toBe(false);
  });

  it('allows takeover when the current leader is stale', () => {
    expect(shouldClaimProjectSyncLeadership({
      tabId: 'tab-b',
      updatedAt: 10_000,
      focused: true,
    }, 10_000 + SESSION_SYNC_LEADER_STALE_MS + 1, 'tab-a', true, false)).toBe(true);
  });

  it('allows a focused tab to take over from an unfocused leader', () => {
    expect(shouldClaimProjectSyncLeadership({
      tabId: 'tab-b',
      updatedAt: 10_000,
      focused: false,
    }, 10_500, 'tab-a', true, true)).toBe(true);
  });

  it('keeps the current leader while visible even if it temporarily loses focus', () => {
    expect(shouldClaimProjectSyncLeadership({
      tabId: 'tab-b',
      updatedAt: 10_000,
      focused: false,
    }, 10_500, 'tab-a', true, false)).toBe(false);
  });
});
