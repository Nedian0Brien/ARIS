import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/guard';
import { listProjectChats } from '@/lib/happy/chats';
import { getProjectEvents, listPermissionRequests, listProjects } from '@/lib/happy/client';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { Card } from '@/components/ui';
import { ChatInterface } from './ChatInterface';
import { shouldStartChatEntryLoading } from './chatSelection';
import { resolveWorkspaceClientPath } from '@/lib/customization/catalog';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';
import { withAppBasePath } from '@/lib/routing/appPath';
import { deriveWorkspaceTitle } from './workspaceHome';

const INITIAL_EVENTS_PAGE_LIMIT = 40;
const CHAT_TITLE_MAX_LEN = 30;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ chat?: string; surface?: string }>;
}): Promise<Metadata> {
  try {
    const user = await requirePageUser();
    const { sessionId } = await params;
    const resolvedSearchParams = await searchParams;
    const requestedChatId = typeof resolvedSearchParams?.chat === 'string' && resolvedSearchParams.chat.trim()
      ? resolvedSearchParams.chat.trim()
      : null;

    const [sessions, chats] = await Promise.all([
      listProjects(user.id),
      listProjectChats({ projectId: sessionId, userId: user.id, ensureDefault: false }),
    ]);

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) {
      return { title: 'ARIS | Agentic Workspace' };
    }

    const workspaceName = deriveWorkspaceTitle(session.projectName);

    const activeChat = (requestedChatId ? chats.find((c) => c.id === requestedChatId) : null) ?? chats[0];
    const chatTitle = activeChat?.title?.trim();

    if (!chatTitle) {
      return { title: `ARIS - ${workspaceName}` };
    }

    return { title: `ARIS - ${workspaceName} | ${truncate(chatTitle, CHAT_TITLE_MAX_LEN)}` };
  } catch {
    return { title: 'ARIS | Agentic Workspace' };
  }
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ chat?: string; surface?: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedChatId = typeof resolvedSearchParams?.chat === 'string' && resolvedSearchParams.chat.trim()
    ? resolvedSearchParams.chat.trim()
    : null;
  const surfaceMode = resolvedSearchParams?.surface === 'panel' ? 'parallel-panel' : 'full';

  try {
    // ?chat= 파라미터가 없으면 워크스페이스 홈 화면을 보여주기 위해
    // 기본 채팅을 자동 생성하지 않고 채팅 목록만 가져온다.
    const isHomeView = requestedChatId === null;
    const initialModelSettings = await getUserModelSettings(user.id);

    const chats = await listProjectChats({
      projectId: sessionId,
      userId: user.id,
      ensureDefault: !isHomeView,
    });

    // 홈 화면: 이벤트 없이 워크스페이스 메타 정보만 가져온다.
    if (isHomeView) {
      const detail = await getProjectEvents(sessionId, {
        userId: user.id,
        limit: 0,
        chatId: undefined,
        includeUnassigned: false,
      });

      const workspaceRootPath = await resolveWorkspaceClientPath(detail.project.projectName).catch(() => '/');

      return (
        <div className="app-shell app-shell-chat-screen">
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatInterface
              sessionId={sessionId}
              initialEvents={[]}
              initialHasMoreBefore={false}
              initialPermissions={[]}
              isOperator={user.role === 'operator'}
              projectName={workspaceRootPath}
              workspaceRootPath={workspaceRootPath}
              agentFlavor={detail.project.agent}
              sessionModel={detail.project.model}
              approvalPolicy={detail.project.approvalPolicy}
              initialModelSettings={initialModelSettings}
              initialChats={chats}
              activeChatId={null}
              initialShowWorkspaceHome
              surfaceMode={surfaceMode}
            />
          </main>
        </div>
      );
    }

    const activeChat = chats.find((chat) => chat.id === requestedChatId) ?? chats[0];

    const [detail, permissions] = await Promise.all([
      getProjectEvents(sessionId, {
        userId: user.id,
        limit: INITIAL_EVENTS_PAGE_LIMIT,
        chatId: activeChat?.id,
        includeUnassigned: activeChat?.isDefault ?? false,
      }),
      listPermissionRequests({
        projectId: sessionId,
        chatId: activeChat?.id,
        includeUnassigned: activeChat?.isDefault ?? false,
      }),
    ]);

    const workspaceRootPath = await resolveWorkspaceClientPath(detail.project.projectName).catch(() => '/');

    return (
      <div className="app-shell app-shell-chat-screen">
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ChatInterface
            sessionId={sessionId}
            initialEvents={detail.events}
            initialHasMoreBefore={detail.page.hasMoreBefore}
            initialPermissions={permissions}
            isOperator={user.role === 'operator'}
            projectName={workspaceRootPath}
            workspaceRootPath={workspaceRootPath}
            agentFlavor={detail.project.agent}
            sessionModel={detail.project.model}
            approvalPolicy={detail.project.approvalPolicy}
            initialModelSettings={initialModelSettings}
            initialChats={chats}
            activeChatId={activeChat?.id ?? null}
            surfaceMode={surfaceMode}
            initialShowChatEntryLoading={shouldStartChatEntryLoading({
              requestedChatId,
              resolvedChatId: activeChat?.id ?? null,
              isWorkspaceHome: false,
            })}
          />
        </main>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '워크스페이스 정보를 불러올 수 없습니다.';

    return (
      <div className="app-shell app-shell-chat-screen">
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', padding: '1.5rem', gap: '1rem' }}>
          <BackendNotice message={`백엔드 연결 문제: ${message}`} />
          <Card style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
            <p className="text-muted">현재 워크스페이스를 표시할 수 없습니다. 백엔드 연결을 확인하고 다시 시도해 주세요.</p>
            <a href={withAppBasePath('/')} style={{ marginTop: '1rem', display: 'inline-block', color: 'var(--primary)', fontWeight: 700 }}>
              홈으로 돌아가기
            </a>
          </Card>
        </main>
      </div>
    );
  }
}
