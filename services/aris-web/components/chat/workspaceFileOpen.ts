export const WORKSPACE_FILE_OPEN_EVENT = 'aris-open-workspace-file';

export type WorkspaceFileOpenDetail = {
  path: string;
  name?: string;
  line?: number | null;
};

export function dispatchWorkspaceFileOpen(detail: WorkspaceFileOpenDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<WorkspaceFileOpenDetail>(WORKSPACE_FILE_OPEN_EVENT, {
    detail: {
      ...detail,
      line: detail.line ?? null,
    },
  }));
}
