import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getSessionEvents, listPermissionRequests, listSessions } from '@/lib/happy/client';
import { Header } from '@/components/layout/Header';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { Card } from '@/components/ui';
import Link from 'next/link';
import { ChatInterface } from './ChatInterface';
import { resolveWorkspaceClientPath } from '@/lib/customization/catalog';
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
  searchParams: Promise<{ chat?: string }>;
}): Promise<Metadata> {
  try {
    const user = await requirePageUser();
    const { sessionId } = await params;
    const resolvedSearchParams = await searchParams;
    const requestedChatId = typeof resolvedSearchParams?.chat === 'string' && resolvedSearchParams.chat.trim()
      ? resolvedSearchParams.chat.trim()
      : null;

    const [sessions, chats] = await Promise.all([
      listSessions(user.id),
      listSessionChats({ sessionId, userId: user.id, ensureDefault: false }),
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
  searchParams: Promise<{ chat?: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedChatId = typeof resolvedSearchParams?.chat === 'string' && resolvedSearchParams.chat.trim()
    ? resolvedSearchParams.chat.trim()
    : null;

  try {
    // ?chat= 파라미터가 없으면 워크스페이스 홈 화면을 보여주기 위해
    // 기본 채팅을 자동 생성하지 않고 채팅 목록만 가져온다.
    const isHomeView = requestedChatId === null;

    const chats = await listSessionChats({
      sessionId,
      userId: user.id,
      ensureDefault: !isHomeView,
    });

    // 홈 화면: 이벤트 없이 워크스페이스 메타 정보만 가져온다.
    if (isHomeView) {
      const detail = await getSessionEvents(sessionId, {
        userId: user.id,
        limit: 0,
        chatId: undefined,
        includeUnassigned: false,
      });

      const workspaceRootPath = await resolveWorkspaceClientPath(detail.session.projectName).catch(() => '/');

      return (
        <div className="app-shell app-shell-immersive">
          <Header userEmail={user.email} role={user.role} autoHideOnScroll />
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: '64px' }}>
            <ChatInterface
              sessionId={sessionId}
              initialEvents={[]}
              initialHasMoreBefore={false}
              initialPermissions={[]}
              isOperator={user.role === 'operator'}
              projectName={workspaceRootPath}
              workspaceRootPath={workspaceRootPath}
              agentFlavor={detail.session.agent}
              sessionModel={detail.session.model}
              approvalPolicy={detail.session.approvalPolicy}
              initialChats={chats}
              activeChatId={null}
              initialShowWorkspaceHome
            />
          </main>
        </div>
      );
    }

    const activeChat = chats.find((chat) => chat.id === requestedChatId) ?? chats[0];

    const [detail, permissions] = await Promise.all([
      getSessionEvents(sessionId, {
        userId: user.id,
        limit: INITIAL_EVENTS_PAGE_LIMIT,
        chatId: activeChat?.id,
        includeUnassigned: activeChat?.isDefault ?? false,
      }),
      listPermissionRequests({
        sessionId,
        chatId: activeChat?.id,
        includeUnassigned: activeChat?.isDefault ?? false,
      }),
    ]);

    const workspaceRootPath = await resolveWorkspaceClientPath(detail.session.projectName).catch(() => '/');

    return (
      <div className="app-shell app-shell-immersive">
        <Header userEmail={user.email} role={user.role} autoHideOnScroll />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: '64px' }}>
          <ChatInterface
            sessionId={sessionId}
            initialEvents={detail.events}
            initialHasMoreBefore={detail.page.hasMoreBefore}
            initialPermissions={permissions}
            isOperator={user.role === 'operator'}
            projectName={workspaceRootPath}
            workspaceRootPath={workspaceRootPath}
            agentFlavor={detail.session.agent}
            sessionModel={detail.session.model}
            approvalPolicy={detail.session.approvalPolicy}
            initialChats={chats}
            activeChatId={activeChat?.id ?? null}
          />
        </main>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '워크스페이스 정보를 불러올 수 없습니다.';

    return (
      <div className="app-shell app-shell-immersive">
        <Header userEmail={user.email} role={user.role} autoHideOnScroll />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', padding: '1.5rem', paddingTop: 'calc(64px + 1.5rem)', gap: '1rem' }}>
          <BackendNotice message={`백엔드 연결 문제: ${message}`} />
          <Card style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
            <p className="text-muted">현재 워크스페이스를 표시할 수 없습니다. 백엔드 연결을 확인하고 다시 시도해 주세요.</p>
            <Link href="/" style={{ marginTop: '1rem', display: 'inline-block', color: 'var(--primary)', fontWeight: 700 }}>
              홈으로 돌아가기
            </Link>
          </Card>
        </main>
      </div>
    );
  }
}
