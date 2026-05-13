import { NextRequest, NextResponse } from 'next/server';
import { resolveFsPath } from '@/lib/fs/pathResolver';
import {
  readWorkspacePanelIdFromSearchParams,
  WorkspacePanelExecutionTargetError,
  resolveWorkspacePanelExecutionTarget,
} from '@/lib/workspacePanels/executionTarget';

export type FsRequestPath = ReturnType<typeof resolveFsPath> & {
  runtimeSessionId: string | null;
};

function normalizeOptionalString(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function workspacePanelTargetErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WorkspacePanelExecutionTargetError)) return null;
  if (error.code === 'PROJECT_NOT_FOUND') {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ error: '워크스페이스 패널을 찾을 수 없습니다.' }, { status: 404 });
}

export async function resolveFsRequestPath(input: {
  request: NextRequest;
  userId: string;
  requestedPath?: string | null;
}): Promise<FsRequestPath> {
  const { searchParams } = new URL(input.request.url);
  const projectId = normalizeOptionalString(searchParams.get('projectId'));
  if (!projectId) {
    return {
      ...resolveFsPath(input.requestedPath),
      runtimeSessionId: null,
    };
  }

  const target = await resolveWorkspacePanelExecutionTarget({
    userId: input.userId,
    projectId,
    workspacePanelId: readWorkspacePanelIdFromSearchParams(searchParams),
  });

  return {
    ...resolveFsPath(input.requestedPath, { executionRoot: target.executionPath }),
    runtimeSessionId: target.runtimeSessionId,
  };
}

export async function resolveFsBodyPath(input: {
  body: Record<string, unknown>;
  userId: string;
  requestedPath?: string | null;
}): Promise<FsRequestPath> {
  const projectId = typeof input.body.projectId === 'string' && input.body.projectId.trim()
    ? input.body.projectId.trim()
    : null;
  if (!projectId) {
    return {
      ...resolveFsPath(input.requestedPath),
      runtimeSessionId: null,
    };
  }

  const workspacePanelId = typeof input.body.workspacePanelId === 'string' && input.body.workspacePanelId.trim()
    ? input.body.workspacePanelId.trim()
    : typeof input.body.panelId === 'string' && input.body.panelId.trim()
      ? input.body.panelId.trim()
      : null;
  const target = await resolveWorkspacePanelExecutionTarget({
    userId: input.userId,
    projectId,
    workspacePanelId,
  });

  return {
    ...resolveFsPath(input.requestedPath, { executionRoot: target.executionPath }),
    runtimeSessionId: target.runtimeSessionId,
  };
}
