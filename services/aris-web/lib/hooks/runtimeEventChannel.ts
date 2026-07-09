export type RuntimeEventChannelMessage = {
  type?: string;
  source?: string;
  [key: string]: unknown;
};

type RuntimeEventChannelUrlInput = {
  projectId: string;
  chatId?: string | null;
  includeUnassigned?: boolean;
  location?: Pick<Location, 'protocol' | 'host'>;
};

function resolveLocation(input?: Pick<Location, 'protocol' | 'host'>): Pick<Location, 'protocol' | 'host'> {
  if (input) {
    return input;
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location;
  }
  return { protocol: 'http:', host: 'localhost' };
}

export function buildRuntimeEventChannelUrl(input: RuntimeEventChannelUrlInput): string {
  const location = resolveLocation(input.location);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  const chatId = typeof input.chatId === 'string' && input.chatId.trim().length > 0
    ? input.chatId.trim()
    : '';
  if (chatId) {
    params.set('chatId', chatId);
    if (input.includeUnassigned) {
      params.set('includeUnassigned', '1');
    }
  }
  const query = params.toString();
  return `${protocol}//${location.host}/ws/runtime/events/${encodeURIComponent(input.projectId)}${query ? `?${query}` : ''}`;
}

export function shouldRefreshPermissionsForRuntimeMessage(message: RuntimeEventChannelMessage): boolean {
  return message.type === 'permission.created' || message.type === 'permission.updated';
}

export function shouldRefreshRuntimeForRuntimeMessage(message: RuntimeEventChannelMessage): boolean {
  if (message.type === 'project.action' || message.type === 'project.updated' || message.type === 'project.created') {
    return true;
  }
  return message.type === 'event.appended' && message.source === 'mutation';
}
