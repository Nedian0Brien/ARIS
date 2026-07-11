'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchProjectPanelGitOverview,
  type ProjectPanelGitOverview,
} from '../../projectChatSurfaceUtils';

export type WorkspaceGitApi = {
  overview: ProjectPanelGitOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// workspacePanelId가 null이면 프로젝트 루트 git status를 조회한다.
// 마운트 시 1회(푸터의 tracked files 수치용) + Git 탭 활성화 시 + 수동 refresh로 갱신한다.
export function useWorkspaceGit(
  projectId: string,
  workspacePanelId: string | null,
  gitTabActive: boolean,
): WorkspaceGitApi {
  const [overview, setOverview] = useState<ProjectPanelGitOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(() => {
    const reqId = reqRef.current + 1;
    reqRef.current = reqId;
    setLoading(true);
    setError(null);
    void fetchProjectPanelGitOverview(projectId, workspacePanelId)
      .then((next) => {
        if (reqId !== reqRef.current) return;
        setOverview(next);
      })
      .catch((gitError) => {
        if (reqId !== reqRef.current) return;
        setOverview(null);
        setError(gitError instanceof Error ? gitError.message : 'Git 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [projectId, workspacePanelId]);

  useEffect(() => {
    load();
    return () => {
      reqRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (gitTabActive) {
      load();
    }
    // load는 (projectId, panelId) 변경 시 위 효과가 이미 커버 — 탭 재진입 갱신만 담당한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitTabActive]);

  return { overview, loading, error, refresh: load };
}
