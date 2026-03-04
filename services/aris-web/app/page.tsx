import { Suspense } from 'react';
import { requirePageUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import HomePageWrapper from './HomePageClient';

export default async function HomePage() {
  const user = await requirePageUser();
  const sessions = await listSessions();

  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
      <HomePageWrapper user={user} initialSessions={sessions} />
    </Suspense>
  );
}
