import { describe, expect, it } from 'vitest';
import {
  buildRuntimeEventChannelUrl,
  shouldRefreshPermissionsForRuntimeMessage,
  shouldRefreshRuntimeForRuntimeMessage,
} from '@/lib/hooks/runtimeEventChannel';

describe('runtime event channel helpers', () => {
  it('builds a same-origin websocket URL with chat filters', () => {
    const url = buildRuntimeEventChannelUrl({
      projectId: 'session 1',
      chatId: 'chat/1',
      includeUnassigned: true,
      location: {
        protocol: 'https:',
        host: 'lawdigest.kr',
      },
    });

    expect(url).toBe('wss://lawdigest.kr/ws/runtime/events/session%201?chatId=chat%2F1&includeUnassigned=1');
  });

  it('refreshes permissions only for permission broadcasts', () => {
    expect(shouldRefreshPermissionsForRuntimeMessage({ type: 'permission.created' })).toBe(true);
    expect(shouldRefreshPermissionsForRuntimeMessage({ type: 'permission.updated' })).toBe(true);
    expect(shouldRefreshPermissionsForRuntimeMessage({ type: 'event.appended' })).toBe(false);
  });

  it('refreshes runtime status for project actions and persisted mutation events', () => {
    expect(shouldRefreshRuntimeForRuntimeMessage({ type: 'project.action' })).toBe(true);
    expect(shouldRefreshRuntimeForRuntimeMessage({ type: 'event.appended', source: 'mutation' })).toBe(true);
    expect(shouldRefreshRuntimeForRuntimeMessage({ type: 'event.appended', source: 'runtime' })).toBe(false);
  });
});
