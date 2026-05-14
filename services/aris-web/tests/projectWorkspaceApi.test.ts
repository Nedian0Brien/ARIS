import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
const route = readFileSync(resolve(__dirname, '../app/api/projects/[projectId]/workspace/route.ts'), 'utf8');
const projectChatSurface = readFileSync(resolve(__dirname, '../components/project-chat/ProjectChatSurface.tsx'), 'utf8');

describe('project workspace API boundary', () => {
  it('defines workspace as project-scoped parallel panel layout storage', () => {
    expect(schema).toContain('model Workspace');
    expect(schema).toContain('model WorkspacePanel');
    expect(schema).toContain('projectId');
    expect(schema).toContain('layoutJson');
    expect(schema).toContain('@@unique([userId, projectId, title])');
    expect(schema).not.toContain('model ProjectWorkspace');
  });

  it('exposes a project workspace route instead of using runtime sessions for layout', () => {
    expect(route).toContain('getProjectWorkspace');
    expect(route).toContain('saveProjectWorkspace');
    expect(route).toContain('projectId');
  });

  it('hydrates and persists project parallel panels through the workspace API with local fallback', () => {
    expect(projectChatSurface).toContain('buildProjectWorkspacePath(projectId)');
    expect(projectChatSurface).toContain('fetchProjectWorkspaceLayout');
    expect(projectChatSurface).toContain('saveProjectWorkspaceLayout');
    expect(projectChatSurface).toContain('parseProjectPanelApiState(layout, validChatIds)');
    expect(projectChatSurface).toContain('const payload = \'version\' in layout');
    expect(projectChatSurface).toContain('readLocalStorage(parallelLayoutStorageKey)');
  });
});
