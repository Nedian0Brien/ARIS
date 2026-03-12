import { useEffect, useState } from 'react';
import { redirectToLoginWithNext } from '@/lib/hooks/authRedirect';

const RUNTIME_POLL_INTERVAL_MS = 3000;
const runtimeStateCache = new Map<string, boolean>();
const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function useSessionRuntime(sessionId: string, chatId?: string | null, enabled = true) {
  const cacheKey = `${sessionId}:${chatId?.trim() || '__default__'}`;
  const [isRunning, setIsRunning] = useState(() => runtimeStateCache.get(cacheKey) ?? false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let stopped = false;
    setIsRunning(runtimeStateCache.get(cacheKey) ?? false);
    setRuntimeError(null);

    if (!enabled) {
      return undefined;
    }

    const refresh = async () => {
      if (disposed || inFlight || stopped) {
        return;
      }
      if (!isDocumentVisible()) {
        return;
      }
      inFlight = true;
      try {
        const query = chatId && chatId.trim().length > 0
          ? `?chatId=${encodeURIComponent(chatId.trim())}`
          : '';
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/runtime${query}`, {
          cache: 'no-store',
        });
        if (response.status === 401) {
          redirectToLoginWithNext();
          return;
        }
        if (response.status === 404) {
          if (!disposed) {
            setIsRunning(false);
            setRuntimeError('워크스페이스가 종료되었거나 삭제되었습니다.');
          }
          stopped = true;
          return;
        }
        if (!response.ok) {
          throw new Error(`Runtime status sync failed (${response.status})`);
        }
        const body = (await response.json()) as { isRunning?: boolean };
        if (!disposed) {
          const nextIsRunning = Boolean(body.isRunning);
          runtimeStateCache.set(cacheKey, nextIsRunning);
          setIsRunning(nextIsRunning);
          setRuntimeError(null);
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : 'Failed to sync runtime status';
          setRuntimeError(message);
        }
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, RUNTIME_POLL_INTERVAL_MS);

    const syncWhenVisible = () => {
      if (!disposed && isDocumentVisible()) {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenVisible);
    };
  }, [cacheKey, sessionId, chatId, enabled]);

  return { isRunning, runtimeError };
}
