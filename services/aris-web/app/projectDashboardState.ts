import type { ProjectSummary } from '@/lib/happy/types';

export function reconcileDeletedProjects(
  projects: ProjectSummary[],
  pendingDeletedIds: Set<string>,
): {
  projects: ProjectSummary[];
  pendingDeletedIds: Set<string>;
} {
  if (pendingDeletedIds.size === 0) {
    return {
      projects,
      pendingDeletedIds,
    };
  }

  const incomingIds = new Set(projects.map((project) => project.id));
  const nextPendingDeletedIds = new Set(
    [...pendingDeletedIds].filter((projectId) => incomingIds.has(projectId)),
  );
  const isPendingSetUnchanged =
    nextPendingDeletedIds.size === pendingDeletedIds.size
    && [...nextPendingDeletedIds].every((projectId) => pendingDeletedIds.has(projectId));

  return {
    projects: projects.filter((project) => !pendingDeletedIds.has(project.id)),
    pendingDeletedIds: isPendingSetUnchanged ? pendingDeletedIds : nextPendingDeletedIds,
  };
}
