export type WorkspacePageScrollMemory = Record<string, number>;

type TransitionWorkspacePageScrollMemoryInput = {
  memory: WorkspacePageScrollMemory;
  previousPageId: string;
  previousScrollTop: number;
  nextPageId: string;
  shouldStorePreviousPage?: boolean;
  shouldRestoreNextPage?: boolean;
};

type TransitionWorkspacePageScrollMemoryResult = {
  memory: WorkspacePageScrollMemory;
  nextScrollTop: number | null;
};

export function transitionWorkspacePageScrollMemory({
  memory,
  previousPageId,
  previousScrollTop,
  nextPageId,
  shouldStorePreviousPage = true,
  shouldRestoreNextPage = true,
}: TransitionWorkspacePageScrollMemoryInput): TransitionWorkspacePageScrollMemoryResult {
  const nextMemory: WorkspacePageScrollMemory = shouldStorePreviousPage
    ? {
        ...memory,
        [previousPageId]: Math.max(0, previousScrollTop),
      }
    : { ...memory };

  return {
    memory: nextMemory,
    nextScrollTop: shouldRestoreNextPage ? (nextMemory[nextPageId] ?? 0) : null,
  };
}
