import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
const projectWorkspaces = readFileSync(resolve(__dirname, '../lib/happy/projectWorkspaces.ts'), 'utf8');
const workspaceRoute = readFileSync(resolve(__dirname, '../app/api/projects/[projectId]/workspace/route.ts'), 'utf8');

describe('workspace panel runtime linkage', () => {
  it('persists panel runtime/worktree metadata as first-class WorkspacePanel rows', () => {
    const panelStart = schema.indexOf('model WorkspacePanel {');
    const panelEnd = schema.indexOf('model SessionMetadata', panelStart);
    const panelModel = schema.slice(panelStart, panelEnd);

    expect(panelModel).toContain('workspaceId');
    expect(panelModel).toContain('chatId');
    expect(panelModel).toMatch(/\bruntimeSessionId\s+String\?/);
    expect(panelModel).toMatch(/\bbranch\s+String\?/);
    expect(panelModel).toMatch(/\bworktreePath\s+String\?/);
    expect(panelModel).toContain('@@unique([workspaceId, chatId])');
  });

  it('normalizes layout leaves against persisted WorkspacePanel records', () => {
    expect(projectWorkspaces).toContain('prisma.workspacePanel');
    expect(projectWorkspaces).toContain('syncWorkspacePanelsForLayout');
    expect(projectWorkspaces).toContain('runtimeSessionId');
    expect(projectWorkspaces).toContain('worktreePath');
    expect(projectWorkspaces).not.toContain('prisma.projectWorkspace');
  });

  it('allows workspace PATCH callers to attach panel runtime metadata', () => {
    expect(workspaceRoute).toContain('panelRuntime');
    expect(workspaceRoute).toContain('runtimeSessionId');
    expect(workspaceRoute).toContain('worktreePath');
  });
});
