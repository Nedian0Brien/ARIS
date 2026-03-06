import { useEffect, useState } from 'react';

const RUNTIME_POLL_INTERVAL_MS = 1500;

export function useSessionRuntime(sessionId: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const refresh = async () => {
      if (disposed || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/runtime`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Runtime status sync failed (${response.status})`);
        }
        const body = (await response.json()) as { isRunning?: boolean };
        if (!disposed) {
          setIsRunning(Boolean(body.isRunning));
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

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  return { isRunning, runtimeError };
}
