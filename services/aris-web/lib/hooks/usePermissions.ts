import { useState, useEffect, useMemo, useCallback } from 'react';
import type { PermissionRequest, PermissionDecision } from '@/lib/happy/types';

function arePermissionsEqual(prev: PermissionRequest[], next: PermissionRequest[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    const before = prev[i];
    const after = next[i];
    if (
      before.id !== after.id ||
      before.state !== after.state ||
      before.command !== after.command ||
      before.reason !== after.reason ||
      before.risk !== after.risk ||
      before.requestedAt !== after.requestedAt
    ) {
      return false;
    }
  }

  return true;
}

export function usePermissions(sessionId: string, initialPermissions: PermissionRequest[]) {
  const [permissions, setPermissions] = useState<PermissionRequest[]>(initialPermissions);
  const [loadingPermissionId, setLoadingPermissionId] = useState<string | null>(null);
  const [ignoredPendingIds, setIgnoredPendingIds] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermissions(initialPermissions);
    setIgnoredPendingIds({});
    setError(null);
  }, [sessionId, initialPermissions]);

  const refreshPermissions = useCallback(async () => {
    try {
      const response = await fetch(`/api/runtime/permissions?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Permission sync failed (${response.status})`);
      }

      const body = (await response.json()) as { permissions?: PermissionRequest[] };
      const nextPermissions = Array.isArray(body.permissions) ? body.permissions : [];

      setPermissions((prev) => {
        const merged = [...nextPermissions].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
        return arePermissionsEqual(prev, merged) ? prev : merged;
      });

      const nextPendingIds = new Set(nextPermissions.map((item) => item.id));
      setIgnoredPendingIds((prev) => {
        const keys = Object.keys(prev);
        if (keys.length === 0) {
          return prev;
        }

        let changed = false;
        const filtered: Record<string, true> = {};
        for (const key of keys) {
          if (nextPendingIds.has(key)) {
            filtered[key] = true;
          } else {
            changed = true;
          }
        }
        return changed ? filtered : prev;
      });

      setError(null);
    } catch {
      setError('권한 요청 동기화를 확인하세요.');
    }
  }, [sessionId]);

  useEffect(() => {
    let aborted = false;

    async function sync() {
      if (aborted) {
        return;
      }
      await refreshPermissions();
    }

    void sync();
    const timer = setInterval(sync, 5000);

    return () => {
      aborted = true;
      clearInterval(timer);
    };
  }, [refreshPermissions]);

  const pendingPermissions = useMemo(
    () => permissions.filter((item) => item.state === 'pending' && !ignoredPendingIds[item.id]),
    [permissions, ignoredPendingIds]
  );

  const decidePermission = async (permissionId: string, decision: PermissionDecision) => {
    setLoadingPermissionId(permissionId);
    setError(null);
    try {
      const response = await fetch('/api/runtime/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, decision }),
      });
      
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to decide permission');
      }

      setPermissions((prev) =>
        prev.map((item) =>
          item.id === permissionId
            ? { ...item, state: decision === 'deny' ? 'denied' : 'approved' }
            : item
        )
      );
      setIgnoredPendingIds((prev) => ({ ...prev, [permissionId]: true }));
      void refreshPermissions();
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process permission';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoadingPermissionId(null);
    }
  };

  return {
    permissions,
    pendingPermissions,
    loadingPermissionId,
    decidePermission,
    error,
  };
}
