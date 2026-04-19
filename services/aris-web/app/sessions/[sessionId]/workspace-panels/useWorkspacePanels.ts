'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeWorkspacePanelLayout, resolveWorkspaceEntryPageId } from '@/lib/workspacePanels/layout';
import type { WorkspacePanelLayout, WorkspacePanelType } from '@/lib/workspacePanels/types';

function resolveActivePageId(layout: WorkspacePanelLayout): string {
  return layout.activePage.kind === 'panel' ? layout.activePage.panelId : 'chat';
}

export function useWorkspacePanels(sessionId: string) {
  const [layout, setLayout] = useState<WorkspacePanelLayout>(() => normalizeWorkspacePanelLayout(null));
  const [activePageId, setActivePageId] = useState('chat');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/panels`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('PANEL_LAYOUT_LOAD_FAILED');
        }

        const body = await response.json() as { layout?: unknown };
        const nextLayout = normalizeWorkspacePanelLayout(body.layout);
        if (cancelled) return;
        setLayout(nextLayout);
        setActivePageId(resolveWorkspaceEntryPageId(nextLayout));
      } catch {
        if (cancelled) return;
        setError('패널 레이아웃을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const createPanel = useCallback(async (type: WorkspacePanelType) => {
    setError(null);

    const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) {
      throw new Error('PANEL_CREATE_FAILED');
    }

    const body = await response.json() as { layout?: unknown };
    const nextLayout = normalizeWorkspacePanelLayout(body.layout);
    setLayout(nextLayout);
    setActivePageId(resolveActivePageId(nextLayout));
    return nextLayout;
  }, [sessionId]);

  const savePanel = useCallback(async (
    panelId: string,
    updates: {
      title?: string;
      config?: Record<string, unknown>;
    },
  ) => {
    setError(null);

    const response = await fetch(
      `/api/runtime/sessions/${encodeURIComponent(sessionId)}/panels/${encodeURIComponent(panelId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      throw new Error('PANEL_SAVE_FAILED');
    }

    const body = await response.json() as { layout?: unknown };
    const nextLayout = normalizeWorkspacePanelLayout(body.layout);
    setLayout(nextLayout);
    setActivePageId(resolveActivePageId(nextLayout));
    return nextLayout;
  }, [sessionId]);

  const deletePanel = useCallback(async (panelId: string) => {
    setError(null);

    const response = await fetch(
      `/api/runtime/sessions/${encodeURIComponent(sessionId)}/panels/${encodeURIComponent(panelId)}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok) {
      throw new Error('PANEL_DELETE_FAILED');
    }

    const body = await response.json() as { layout?: unknown };
    const nextLayout = normalizeWorkspacePanelLayout(body.layout);
    setLayout(nextLayout);
    setActivePageId(resolveActivePageId(nextLayout));
    return nextLayout;
  }, [sessionId]);

  const hasPanels = useMemo(() => layout.panels.length > 0, [layout.panels.length]);

  return {
    layout,
    activePageId,
    setActivePageId,
    loading,
    error,
    hasPanels,
    createPanel,
    savePanel,
    deletePanel,
  };
}
