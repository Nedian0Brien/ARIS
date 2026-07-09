import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { runChatTerminalCommand, HappyHttpError } from '@/lib/happy/client';
import { ensureProjectWorkspacePanelRuntimes } from '@/lib/happy/workspacePanelRuntimes';
import {
  readWorkspacePanelIdFromRecord,
  resolveWorkspacePanelExecutionTarget,
  type WorkspacePanelExecutionTarget,
  WorkspacePanelExecutionTargetError,
} from '@/lib/workspacePanels/executionTarget';

function workspacePanelTargetErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WorkspacePanelExecutionTargetError)) return null;
  if (error.code === 'PROJECT_NOT_FOUND') {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ error: '워크스페이스 패널을 찾을 수 없습니다.' }, { status: 404 });
}

async function resolveWorkspacePanelExecutionTargetWithRuntime(input: {
  userId: string;
  projectId: string;
  workspacePanelId: string | null;
}): Promise<WorkspacePanelExecutionTarget> {
  let target = await resolveWorkspacePanelExecutionTarget(input);
  if (input.workspacePanelId && target.source === 'workspace-panel' && target.runtimeProjectId === input.projectId) {
    const panelRuntimeErrors = await ensureProjectWorkspacePanelRuntimes({
      userId: input.userId,
      projectId: input.projectId,
    });
    if (panelRuntimeErrors[input.workspacePanelId]) {
      throw new Error(`runtime 생성 실패: ${panelRuntimeErrors[input.workspacePanelId]}`);
    }
    target = await resolveWorkspacePanelExecutionTarget(input);
  }
  return target;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { projectId } = await params;
  const body = await request.json().catch(() => ({})) as {
    chatId?: string;
    command?: string;
    agent?: string;
    model?: string;
    modelReasoningEffort?: string;
    workspacePanelId?: string;
    panelId?: string;
  };
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  if (!command || !chatId) {
    return NextResponse.json({ error: 'chatId and command are required' }, { status: 400 });
  }

  try {
    const target = await resolveWorkspacePanelExecutionTargetWithRuntime({
      userId: auth.user.id,
      projectId: projectId,
      workspacePanelId: readWorkspacePanelIdFromRecord(body),
    });
    const events = await runChatTerminalCommand({
      projectId,
      runtimeProjectId: target.runtimeProjectId === projectId ? undefined : target.runtimeProjectId,
      chatId,
      command,
    });

    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const response = workspacePanelTargetErrorResponse(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : '터미널 명령 실행에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
