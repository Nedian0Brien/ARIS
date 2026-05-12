import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getSessionEvents } from '@/lib/happy/client';
import { resolveWorkspaceClientPath } from '@/lib/customization/catalog';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';
import { getParallelWorkspace } from '@/lib/parallelWorkspace/store';
import type { ParallelPanelRecord } from '@/lib/parallelWorkspace/layout';
import { ParallelWorkspaceShell } from './ParallelWorkspaceShell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}): Promise<Metadata> {
  try {
    const user = await requirePageUser();
    const { workspaceId } = await params;
    const workspace = await getParallelWorkspace(user.id, workspaceId);
    return {
      title: workspace ? `ARIS - ${workspace.title}` : 'ARIS | Parallel Workspace',
    };
  } catch {
    return { title: 'ARIS | Parallel Workspace' };
  }
}

async function loadPanelPayload(input: {
  userId: string;
  panel: ParallelPanelRecord;
}) {
  try {
    const [detail, chats] = await Promise.all([
      getSessionEvents(input.panel.sessionId, {
        userId: input.userId,
        limit: 0,
        includeUnassigned: false,
      }),
      listSessionChats({
        sessionId: input.panel.sessionId,
        userId: input.userId,
        ensureDefault: false,
      }),
    ]);
    const rootPath = input.panel.worktreePath || detail.session.hostPath || detail.session.projectName;
    const workspaceRootPath = await resolveWorkspaceClientPath(rootPath).catch(() => rootPath);

    return {
      panelId: input.panel.id,
      sessionId: input.panel.sessionId,
      initialEvents: [],
      initialHasMoreBefore: false,
      initialPermissions: [],
      projectName: workspaceRootPath,
      workspaceRootPath,
      agentFlavor: detail.session.agent,
      sessionModel: detail.session.model,
      approvalPolicy: detail.session.approvalPolicy,
      initialChats: chats,
      activeChatId: null,
      error: null,
    };
  } catch (error) {
    return {
      panelId: input.panel.id,
      sessionId: input.panel.sessionId,
      initialEvents: [],
      initialHasMoreBefore: false,
      initialPermissions: [],
      projectName: input.panel.worktreePath,
      workspaceRootPath: input.panel.worktreePath,
      agentFlavor: input.panel.agent,
      sessionModel: null,
      approvalPolicy: input.panel.approvalPolicy,
      initialChats: [],
      activeChatId: null,
      error: error instanceof Error ? error.message : '세션 정보를 불러오지 못했습니다.',
    };
  }
}

export default async function ParallelWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await requirePageUser();
  const { workspaceId } = await params;
  const workspace = await getParallelWorkspace(user.id, workspaceId);
  if (!workspace) {
    notFound();
  }

  const initialModelSettings = await getUserModelSettings(user.id);
  const panelPayloadList = await Promise.all(
    Object.values(workspace.layout.panels).map((panel) => loadPanelPayload({
      userId: user.id,
      panel,
    })),
  );
  const panels = Object.fromEntries(panelPayloadList.map((panel) => [panel.panelId, panel]));

  return (
    <ParallelWorkspaceShell
      workspace={workspace}
      panels={panels}
      isOperator={user.role === 'operator'}
      initialModelSettings={initialModelSettings}
    />
  );
}
