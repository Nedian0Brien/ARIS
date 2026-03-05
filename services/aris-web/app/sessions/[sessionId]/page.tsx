import { requirePageUser } from '@/lib/auth/guard';
import { getSessionEvents, listPermissionRequests } from '@/lib/happy/client';
import { Header } from '@/components/layout/Header';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { Card } from '@/components/ui';
import Link from 'next/link';
import { ChatInterface } from './ChatInterface';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;

  try {
    const [detail, permissions] = await Promise.all([
      getSessionEvents(sessionId, user.id),
      listPermissionRequests(sessionId),
    ]);

    return (
      <div className="app-shell app-shell-immersive">
        <Header userEmail={user.email} role={user.role} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ChatInterface
            sessionId={sessionId}
            initialEvents={detail.events}
            initialPermissions={permissions}
            isOperator={user.role === 'operator'}
            projectName={detail.session.projectName}
            alias={detail.session.alias}
            agentFlavor={detail.session.agent}
          />
        </main>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '세션 정보를 불러올 수 없습니다.';

    return (
      <div className="app-shell app-shell-immersive">
        <Header userEmail={user.email} role={user.role} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', padding: '1.5rem', gap: '1rem' }}>
          <BackendNotice message={`백엔드 연결 문제: ${message}`} />
          <Card style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
            <p className="text-muted">현재 세션을 표시할 수 없습니다. 백엔드 연결을 확인하고 다시 시도해 주세요.</p>
            <Link href="/" style={{ marginTop: '1rem', display: 'inline-block', color: 'var(--primary)', fontWeight: 700 }}>
              홈으로 돌아가기
            </Link>
          </Card>
        </main>
      </div>
    );
  }
}
