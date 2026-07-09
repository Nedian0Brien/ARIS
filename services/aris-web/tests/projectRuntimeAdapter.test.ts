import { describe, expect, it } from 'vitest';
import {
  buildProjectChatCollectionPath,
  buildProjectRuntimeActionPath,
  buildProjectRuntimeEventsPath,
  buildProjectRuntimeMetadataPath,
  buildProjectRuntimeSubagentsPath,
  buildProjectRuntimeTerminalPath,
  resolveProjectRuntimeProjectId,
} from '../lib/projectRuntimeAdapter';

describe('project runtime adapter', () => {
  it('keeps project/chat API paths separate from legacy runtime session paths', () => {
    expect(buildProjectChatCollectionPath('project/a b')).toBe('/api/projects/project%2Fa%20b/chats');
    expect(resolveProjectRuntimeProjectId('project/a b')).toBe('project/a b');
    expect(buildProjectRuntimeEventsPath('project/a b')).toBe('/api/runtime/projects/project%2Fa%20b/events');
    expect(buildProjectRuntimeTerminalPath('project/a b')).toBe('/api/runtime/projects/project%2Fa%20b/terminal');
    expect(buildProjectRuntimeActionPath('project/a b')).toBe('/api/runtime/projects/project%2Fa%20b/actions');
    expect(buildProjectRuntimeMetadataPath('project/a b')).toBe('/api/runtime/projects/project%2Fa%20b/metadata');
    expect(buildProjectRuntimeSubagentsPath('project/a b', 'chat/x y')).toBe('/api/runtime/projects/project%2Fa%20b/chats/chat%2Fx%20y/subagents');
  });
});
