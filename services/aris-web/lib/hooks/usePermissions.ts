import { useState, useEffect, useMemo, useCallback } from 'react';
import type { PermissionRequest, PermissionDecision } from '@/lib/happy/types';
import { redirectToLoginWithNext } from '@/lib/hooks/authRedirect';

function arePermissionsEqual(prev: PermissionRequest[], next: PermissionRequest[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    const before = prev[i];
    const after = next[i];
    if (
      before.id !== after.id
      || before.state !== after.state
      || before.command !== after.command
      || before.reason !== after.reason
      || before.risk !== after.risk
      || before.requestedAt !== after.requestedAt
    ) {
      return false;
    }
  }

  return true;
}

export function usePermissions(sessionId: string, initialPermissions: PermissionRequest[]) {
  const [permissions, setPermissions] = useState<PermissionRequest[]>(initialPermissions);
  const [resolvedPermissions, setResolvedPermissions] = useState<PermissionRequest[]>([]);
  const [loadingPermissionId, setLoadingPermissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermissions(initialPermissions);
    setResolvedPermissions([]);
    setError(null);
  }, [sessionId, initialPermissions]);

  const refreshPermissions = useCallback(async () => {
    try {
      const response = await fetch(`/api/runtime/permissions?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      });

      if (response.status === 401) {
        redirectToLoginWithNext();
        return;
      }
      if (response.status === 404) {
        setError('세션이 종료되었거나 삭제되었습니다.');
        return;
      }

      if (!response.ok) {
        throw new Error(`Permission sync failed (${response.status})`);
      }

      const body = (await response.json()) as { permissions?: PermissionRequest[] };
      const nextPermissions = Array.isArray(body.permissions) ? body.permissions : [];

      setPermissions((prev) => {
        const merged = [...nextPermissions].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
        return arePermissionsEqual(prev, merged) ? prev : merged;
      });

      setResolvedPermissions((prev) => {
        const pendingIds = new Set(nextPermissions.map((item) => item.id));
        const next = prev.filter((item) => !pendingIds.has(item.id));
        return arePermissionsEqual(prev, next) ? prev : next;
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
    () => permissions.filter((item) => item.state === 'pending'),
    [permissions],
  );

  const displayPermissions = useMemo(() => {
    const pendingIds = new Set(pendingPermissions.map((item) => item.id));
    return [...pendingPermissions, ...resolvedPermissions.filter((item) => !pendingIds.has(item.id))]
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }, [pendingPermissions, resolvedPermissions]);

  const permissionById = useMemo(() => {
    const map = new Map<string, PermissionRequest>();
    for (const item of permissions) {
      map.set(item.id, item);
    }
    for (const item of resolvedPermissions) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [permissions, resolvedPermissions]);

  const decidePermission = useCallback(async (permissionId: string, decision: PermissionDecision) => {
    const current = permissionById.get(permissionId);
    if (!current) {
      return { success: false, error: 'Permission not found' };
    }

    const nextState: PermissionRequest['state'] = decision === 'deny' ? 'denied' : 'approved';
    const resolved = { ...current, state: nextState };

    setPermissions((prev) =>
      prev.map((item) => (item.id === permissionId ? resolved : item)),
    );
    setResolvedPermissions((prev) => {
      const next = [...prev.filter((item) => item.id !== permissionId), resolved]
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
      return arePermissionsEqual(prev, next) ? prev : next;
    });

    setLoadingPermissionId(permissionId);
    setError(null);
    try {
      const response = await fetch('/api/runtime/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, decision }),
      });

      if (response.status === 401) {
        redirectToLoginWithNext();
        return { success: false, error: 'Unauthorized' };
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to decide permission');
      }

      void refreshPermissions();
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process permission';
      setError(msg);
      setPermissions((prev) =>
        prev.map((item) => (item.id === permissionId ? current : item)),
      );
      setResolvedPermissions((prev) => prev.filter((item) => item.id !== permissionId));
      return { success: false, error: msg };
    } finally {
      setLoadingPermissionId(null);
    }
  }, [permissionById, refreshPermissions]);

  return {
    permissions,
    pendingPermissions,
    displayPermissions,
    loadingPermissionId,
    decidePermission,
    error,
  };
}
