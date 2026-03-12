import { useEffect, useRef, useState } from 'react';
import { readLocalStorage, writeLocalStorage, removeLocalStorage } from '@/lib/browser/localStorage';

const SESSION_SYNC_LEADER_HEARTBEAT_MS = 2000;
export const SESSION_SYNC_LEADER_STALE_MS = 7000;

type SessionSyncLeaderRecord = {
  tabId: string;
  updatedAt: number;
  focused: boolean;
};

function isTabFocusedAndVisible(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible' && document.hasFocus();
}

export function parseSessionSyncLeaderRecord(raw: string | null): SessionSyncLeaderRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSyncLeaderRecord>;
    if (
      typeof parsed.tabId !== 'string'
      || parsed.tabId.trim().length === 0
      || typeof parsed.updatedAt !== 'number'
      || Number.isNaN(parsed.updatedAt)
      || typeof parsed.focused !== 'boolean'
    ) {
      return null;
    }

    return {
      tabId: parsed.tabId,
      updatedAt: parsed.updatedAt,
      focused: parsed.focused,
    };
  } catch {
    return null;
  }
}

export function shouldClaimSessionSyncLeadership(
  record: SessionSyncLeaderRecord | null,
  now: number,
  tabId: string,
  isEligible: boolean,
): boolean {
  if (!isEligible) {
    return false;
  }

  if (!record) {
    return true;
  }

  if (record.tabId === tabId) {
    return true;
  }

  if (now - record.updatedAt > SESSION_SYNC_LEADER_STALE_MS) {
    return true;
  }

  return record.focused === false;
}

export function useSessionSyncLeader(sessionId: string) {
  const tabIdRef = useRef(`session-sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [isLeader, setIsLeader] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storageKey = `aris:session-sync-leader:${sessionId}`;
    let released = false;

    const releaseLeadership = () => {
      const current = parseSessionSyncLeaderRecord(readLocalStorage(storageKey));
      if (current?.tabId === tabIdRef.current) {
        removeLocalStorage(storageKey);
      }
      setIsLeader(false);
    };

    const writeLeadership = (focused: boolean) => {
      const ok = writeLocalStorage(
        storageKey,
        JSON.stringify({
          tabId: tabIdRef.current,
          updatedAt: Date.now(),
          focused,
        } satisfies SessionSyncLeaderRecord),
      );
      if (ok) {
        setIsLeader(true);
        return;
      }

      // localStorage 접근이 막힌 환경에서는 현재 탭만 사용 가능한 것으로 간주한다.
      setIsLeader(true);
    };

    const syncLeadership = () => {
      if (released) {
        return;
      }

      const focused = isTabFocusedAndVisible();
      if (!focused) {
        releaseLeadership();
        return;
      }

      const now = Date.now();
      const current = parseSessionSyncLeaderRecord(readLocalStorage(storageKey));
      if (shouldClaimSessionSyncLeadership(current, now, tabIdRef.current, focused)) {
        writeLeadership(focused);
        return;
      }

      setIsLeader(current?.tabId === tabIdRef.current);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      syncLeadership();
    };

    const handleVisibilityChange = () => {
      syncLeadership();
    };

    const handlePageHide = () => {
      released = true;
      releaseLeadership();
    };

    syncLeadership();
    const timer = window.setInterval(() => {
      syncLeadership();
    }, SESSION_SYNC_LEADER_HEARTBEAT_MS);

    window.addEventListener('focus', syncLeadership);
    window.addEventListener('blur', syncLeadership);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', syncLeadership);
      window.removeEventListener('blur', syncLeadership);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseLeadership();
    };
  }, [sessionId]);

  return { isLeader };
}
