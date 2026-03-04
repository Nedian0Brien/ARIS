import { requirePageUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import HomePageWrapper from './HomePageClient';

export default async function HomePage() {
  const user = await requirePageUser();
  const sessions = await listSessions();

  return <HomePageWrapper user={user} initialSessions={sessions} />;
}
