'use client';

import { useCallback, useEffect, useState } from 'react';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';

export type SavedTerminalSnippet = {
  id: string;
  cmd: string;
};

export type SavedTerminalSnippetsApi = {
  snippets: SavedTerminalSnippet[];
  save: (cmd: string) => void;
  remove: (id: string) => void;
};

function storageKey(projectId: string): string {
  return `aris.term-snippets.${projectId}`;
}

function parseSnippets(raw: string | null): SavedTerminalSnippet[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedTerminalSnippet => !!item
        && typeof item === 'object'
        && typeof (item as SavedTerminalSnippet).id === 'string'
        && typeof (item as SavedTerminalSnippet).cmd === 'string')
      .slice(0, 20);
  } catch {
    return [];
  }
}

// 프로젝트별 사용자 저장 스니펫 — localStorage 보관(DB 동기화는 범위 외).
export function useSavedTerminalSnippets(projectId: string): SavedTerminalSnippetsApi {
  const [snippets, setSnippets] = useState<SavedTerminalSnippet[]>([]);

  useEffect(() => {
    setSnippets(parseSnippets(readLocalStorage(storageKey(projectId))));
  }, [projectId]);

  const persist = useCallback((next: SavedTerminalSnippet[]) => {
    setSnippets(next);
    writeLocalStorage(storageKey(projectId), JSON.stringify(next));
  }, [projectId]);

  const save = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setSnippets((current) => {
      if (current.some((item) => item.cmd === trimmed)) return current;
      const next = [...current, { id: `saved-${Date.now()}-${current.length}`, cmd: trimmed }].slice(-20);
      writeLocalStorage(storageKey(projectId), JSON.stringify(next));
      return next;
    });
  }, [projectId]);

  const remove = useCallback((id: string) => {
    setSnippets((current) => {
      const next = current.filter((item) => item.id !== id);
      writeLocalStorage(storageKey(projectId), JSON.stringify(next));
      return next;
    });
  }, [projectId]);

  return { snippets, save, remove };
}
