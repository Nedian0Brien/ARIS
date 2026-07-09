function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function resolveProjectRuntimeProjectId(projectId: string): string {
  return projectId;
}

export function buildProjectCollectionPath(): string {
  return '/api/projects';
}

export function buildProjectChatCollectionPath(projectId: string): string {
  return `/api/projects/${encodeSegment(projectId)}/chats`;
}

export function buildProjectChatDetailPath(projectId: string, chatId: string): string {
  return `/api/projects/${encodeSegment(projectId)}/chats/${encodeSegment(chatId)}`;
}

export function buildProjectWorkspacePath(projectId: string): string {
  return `/api/projects/${encodeSegment(projectId)}/workspace`;
}

function buildProjectRuntimePath(projectId: string, suffix: string): string {
  const runtimeProjectId = resolveProjectRuntimeProjectId(projectId);
  return `/api/runtime/projects/${encodeSegment(runtimeProjectId)}${suffix}`;
}

export function buildProjectRuntimeEventsPath(projectId: string, params?: URLSearchParams): string {
  const query = params && params.toString() ? `?${params.toString()}` : '';
  return buildProjectRuntimePath(projectId, `/events${query}`);
}

export function buildProjectRuntimeTerminalPath(projectId: string): string {
  return buildProjectRuntimePath(projectId, '/terminal');
}

export function buildProjectRuntimeActionPath(projectId: string): string {
  return buildProjectRuntimePath(projectId, '/actions');
}

export function buildProjectRuntimeMetadataPath(projectId: string): string {
  return buildProjectRuntimePath(projectId, '/metadata');
}

export function buildProjectRuntimeStatusPath(projectId: string): string {
  return buildProjectRuntimePath(projectId, '/runtime');
}

export function buildProjectRuntimeSubagentsPath(projectId: string, chatId: string): string {
  return buildProjectRuntimePath(projectId, `/chats/${encodeSegment(chatId)}/subagents`);
}
