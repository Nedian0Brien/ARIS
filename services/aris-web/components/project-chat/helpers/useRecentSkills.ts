'use client';

import { useCallback, useEffect, useState } from 'react';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';

const MAX_RECENT_SKILLS = 5;

function storageKey(projectId: string): string {
  return `aris:project-chat:recent-skills:${projectId}`;
}

function parseCommands(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.startsWith('/'));
  } catch {
    return [];
  }
}

/** 액션 시트에서 최근에 사용한 스킬 커맨드를 프로젝트 단위로 기억한다. */
export function useRecentSkills(projectId: string) {
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  useEffect(() => {
    setRecentCommands(parseCommands(readLocalStorage(storageKey(projectId))));
  }, [projectId]);

  const recordRecentSkill = useCallback((command: string) => {
    setRecentCommands((previous) => {
      const next = [command, ...previous.filter((item) => item !== command)].slice(0, MAX_RECENT_SKILLS);
      writeLocalStorage(storageKey(projectId), JSON.stringify(next));
      return next;
    });
  }, [projectId]);

  return { recentCommands, recordRecentSkill };
}
