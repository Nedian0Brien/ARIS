function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function resolveProjectRuntimeSessionId(projectId: string): string {
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

function buildLegacyRuntimePath(projectId: string, suffix: string): string {
  const runtimeSessionId = resolveProjectRuntimeSessionId(projectId);
  return `/api/runtime/sessions/${encodeSegment(runtimeSessionId)}${suffix}`;
}

export function buildProjectRuntimeEventsPath(projectId: string, params?: URLSearchParams): string {
  const query = params && params.toString() ? `?${params.toString()}` : '';
  return buildLegacyRuntimePath(projectId, `/events${query}`);
}

export function buildProjectRuntimeTerminalPath(projectId: string): string {
  return buildLegacyRuntimePath(projectId, '/terminal');
}

export function buildProjectRuntimeActionPath(projectId: string): string {
  return buildLegacyRuntimePath(projectId, '/actions');
}

export function buildProjectRuntimeMetadataPath(projectId: string): string {
  return buildLegacyRuntimePath(projectId, '/metadata');
}

export function buildProjectRuntimeStatusPath(projectId: string): string {
  return buildLegacyRuntimePath(projectId, '/runtime');
}
