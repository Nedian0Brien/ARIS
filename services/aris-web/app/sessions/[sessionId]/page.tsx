import { requirePageUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getSessionEvents, listPermissionRequests } from '@/lib/happy/client';
import { Header } from '@/components/layout/Header';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { Card } from '@/components/ui';
import Link from 'next/link';
import { ChatInterface } from './ChatInterface';

const INITIAL_EVENTS_PAGE_LIMIT = 40;

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
    const chats = await listSessionChats({
      sessionId,
      userId: user.id,
      ensureDefault: true,
    });
    const activeChat = (requestedChatId
      ? chats.find((chat) => chat.id === requestedChatId)
      : null) ?? chats[0];

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
            projectName={detail.session.projectName}
            alias={detail.session.alias}
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
