import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  __dirname,
  '../prisma/migrations/20260513103500_project_chat_workspace_panel_migration/migration.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('Project/Chat/Workspace migration boundary', () => {
  it('renames the product domain models to Project, Chat, Workspace, and WorkspacePanel', () => {
    expect(schema).toContain('model Project {');
    expect(schema).toContain('model Chat {');
    expect(schema).toContain('model Workspace {');
    expect(schema).toContain('model WorkspacePanel {');
    expect(schema).not.toContain('model ProjectWorkspace');
    expect(schema).not.toContain('model ProjectChat {');
  });

  it('uses projectId on Chat instead of product-level sessionId', () => {
    const chatStart = schema.indexOf('model Chat {');
    const chatEnd = schema.indexOf('model ProjectRun', chatStart);
    const chatModel = schema.slice(chatStart, chatEnd);

    expect(chatModel).toContain('projectId');
    expect(chatModel).not.toContain('sessionId');
    expect(chatModel).toContain('@@index([projectId, userId, isPinned, lastActivityAt])');
  });

  it('contains an explicit SQL migration for the table and column rename path', () => {
    expect(migration).toContain('ALTER TABLE "Workspace" RENAME TO "Project";');
    expect(migration).toContain('ALTER TABLE "ProjectWorkspace" RENAME TO "Workspace";');
    expect(migration).toContain('ALTER TABLE "ProjectChat" RENAME TO "Chat";');
    expect(migration).toContain('ALTER TABLE "Chat" RENAME COLUMN "sessionId" TO "projectId";');
    expect(migration).toContain('CREATE TABLE "WorkspacePanel"');
  });
});
