import { useState, useEffect, useMemo } from 'react';
import type { PermissionRequest, PermissionDecision } from '@/lib/happy/types';

export function usePermissions(sessionId: string, initialPermissions: PermissionRequest[]) {
  const [permissions, setPermissions] = useState<PermissionRequest[]>(initialPermissions);
  const [loadingPermissionId, setLoadingPermissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermissions(initialPermissions);
  }, [sessionId, initialPermissions]);

  const pendingPermissions = useMemo(
    () => permissions.filter((item) => item.state === 'pending'),
    [permissions]
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
