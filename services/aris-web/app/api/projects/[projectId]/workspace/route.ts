import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listProjectChats } from '@/lib/happy/projectChats';
import { getProjectWorkspace, saveProjectWorkspace } from '@/lib/happy/projectWorkspaces';
import type { ProjectWorkspacePanelRuntimePatch } from '@/lib/happy/projectWorkspaces';
import { ensureProjectWorkspacePanelRuntimes } from '@/lib/happy/workspacePanelRuntimes';
import type { ProjectParallelPanelTreeState } from '@/app/projectParallelPanels';

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePanelRuntime(input: unknown): Record<string, ProjectWorkspacePanelRuntimePatch> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const next: Record<string, ProjectWorkspacePanelRuntimePatch> = {};
  for (const [panelId, value] of Object.entries(input)) {
    if (!panelId.trim() || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as {
      runtimeSessionId?: unknown;
      branch?: unknown;
      worktreePath?: unknown;
      meta?: unknown;
    };
    const patch: ProjectWorkspacePanelRuntimePatch = {};
    const runtimeSessionId = normalizeOptionalString(record.runtimeSessionId);
    const branch = normalizeOptionalString(record.branch);
    const worktreePath = normalizeOptionalString(record.worktreePath);
    if (runtimeSessionId !== undefined) patch.runtimeSessionId = runtimeSessionId;
    if (branch !== undefined) patch.branch = branch;
    if (worktreePath !== undefined) patch.worktreePath = worktreePath;
    if (record.meta !== undefined && (!record.meta || typeof record.meta === 'object')) {
      patch.meta = record.meta as ProjectWorkspacePanelRuntimePatch['meta'];
    }
    next[panelId] = patch;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId } = await params;
    const chats = await listProjectChats({ projectId, userId: auth.user.id, ensureDefault: false });
    const validChatIds = new Set(chats.map((chat) => chat.id));
    const workspace = await getProjectWorkspace({
      userId: auth.user.id,
      projectId,
      validChatIds,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project workspace';
    if (message === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      layout?: ProjectParallelPanelTreeState | null;
      panelRuntime?: unknown;
      repairPanelRuntimes?: boolean;
    };
    const chats = await listProjectChats({ projectId, userId: auth.user.id, ensureDefault: false });
    const validChatIds = new Set(chats.map((chat) => chat.id));
    const savedWorkspace = await saveProjectWorkspace({
      userId: auth.user.id,
      projectId,
      layout: body.layout ?? null,
      validChatIds,
      panelRuntime: normalizePanelRuntime(body.panelRuntime),
    });
    const panelRuntimeErrors = savedWorkspace.layout
      ? await ensureProjectWorkspacePanelRuntimes({
        userId: auth.user.id,
        projectId,
        repairStale: body.repairPanelRuntimes === true,
      })
      : {};
    const workspace = await getProjectWorkspace({
      userId: auth.user.id,
      projectId,
      validChatIds,
    });
    return NextResponse.json({ workspace, panelRuntimeErrors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save project workspace';
    if (message === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (message === 'INVALID_WORKSPACE_LAYOUT') {
      return NextResponse.json({ error: '유효하지 않은 workspace layout입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
