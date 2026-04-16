export type WorkspacePageScrollMemory = Record<string, number>;

type TransitionWorkspacePageScrollMemoryInput = {
  memory: WorkspacePageScrollMemory;
  previousPageId: string;
  previousScrollTop: number;
  nextPageId: string;
};

type TransitionWorkspacePageScrollMemoryResult = {
  memory: WorkspacePageScrollMemory;
  nextScrollTop: number;
};

export function transitionWorkspacePageScrollMemory({
  memory,
  previousPageId,
  previousScrollTop,
  nextPageId,
}: TransitionWorkspacePageScrollMemoryInput): TransitionWorkspacePageScrollMemoryResult {
  const nextMemory: WorkspacePageScrollMemory = {
    ...memory,
    [previousPageId]: Math.max(0, previousScrollTop),
  };

  return {
    memory: nextMemory,
    nextScrollTop: nextMemory[nextPageId] ?? 0,
  };
}
