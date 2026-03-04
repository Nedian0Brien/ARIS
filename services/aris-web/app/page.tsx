import { Suspense } from 'react';
import { requirePageUser } from '@/lib/auth/guard';
import { getRuntimeHealth, listSessions } from '@/lib/happy/client';
import HomePageWrapper from './HomePageClient';

export default async function HomePage() {
  const user = await requirePageUser();
  const health = await getRuntimeHealth();
  let runtimeError: string | null = null;
  let sessions: Awaited<ReturnType<typeof listSessions>> = [];

  if (health.happy === 'down') {
    runtimeError = '백엔드 런타임 API에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
  } else {
    try {
      sessions = await listSessions();
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : '백엔드 통신에서 알 수 없는 오류가 발생했습니다.';
    }
  }

  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
      <HomePageWrapper user={user} initialSessions={sessions} runtimeError={runtimeError} />
    </Suspense>
  );
}
