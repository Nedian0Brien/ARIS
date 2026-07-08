'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { withAppBasePath } from '@/lib/routing/appPath';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

type ProjectSkillsState = {
  entries: ProjectSkillEntry[];
  error: string | null;
  loading: boolean;
};

const INITIAL_STATE: ProjectSkillsState = { entries: [], error: null, loading: false };

/** 액션 시트의 스킬 목록. 처음 열릴 때 한 번 불러와 프로젝트 단위로 캐시한다. */
export function useProjectSkills(projectId: string) {
  const [state, setState] = useState<ProjectSkillsState>(INITIAL_STATE);
  const loadedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadedProjectIdRef.current = null;
    setState(INITIAL_STATE);
  }, [projectId]);

  const load = useCallback(async () => {
    if (loadedProjectIdRef.current === projectId) {
      return;
    }
    loadedProjectIdRef.current = projectId;
    setState((current) => ({ ...current, error: null, loading: true }));
    try {
      const response = await fetch(
        withAppBasePath(`/api/projects/${encodeURIComponent(projectId)}/skills`),
        { cache: 'no-store' },
      );
      const body = (await response.json().catch(() => ({}))) as { skills?: ProjectSkillEntry[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? '스킬 목록을 불러오지 못했습니다.');
      }
      setState({ entries: body.skills ?? [], error: null, loading: false });
    } catch (error) {
      loadedProjectIdRef.current = null;
      setState({
        entries: [],
        error: error instanceof Error ? error.message : '스킬 목록을 불러오지 못했습니다.',
        loading: false,
      });
    }
  }, [projectId]);

  return { ...state, load };
}
