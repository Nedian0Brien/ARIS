import { describe, expect, it } from 'vitest';
import {
  buildProjectChatCollectionPath,
  buildProjectRuntimeActionPath,
  buildProjectRuntimeEventsPath,
  buildProjectRuntimeMetadataPath,
  buildProjectRuntimeTerminalPath,
  resolveProjectRuntimeSessionId,
} from '../lib/projectRuntimeAdapter';

describe('project runtime adapter', () => {
  it('keeps project/chat API paths separate from legacy runtime session paths', () => {
    expect(buildProjectChatCollectionPath('project/a b')).toBe('/api/projects/project%2Fa%20b/chats');
    expect(resolveProjectRuntimeSessionId('project/a b')).toBe('project/a b');
    expect(buildProjectRuntimeEventsPath('project/a b')).toBe('/api/runtime/sessions/project%2Fa%20b/events');
    expect(buildProjectRuntimeTerminalPath('project/a b')).toBe('/api/runtime/sessions/project%2Fa%20b/terminal');
    expect(buildProjectRuntimeActionPath('project/a b')).toBe('/api/runtime/sessions/project%2Fa%20b/actions');
    expect(buildProjectRuntimeMetadataPath('project/a b')).toBe('/api/runtime/sessions/project%2Fa%20b/metadata');
  });
});
