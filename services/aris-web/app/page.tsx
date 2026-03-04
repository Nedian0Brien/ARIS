import { requirePageUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import { Header } from '@/components/layout/Header';
import { SessionDashboard } from './SessionDashboard';

export default async function HomePage() {
  const user = await requirePageUser();
  const sessions = await listSessions();

  return (
    <div className="app-shell">
      <Header userEmail={user.email} role={user.role} />
      <main className="main container">
        <SessionDashboard initialSessions={sessions} isOperator={user.role === 'operator'} />
      </main>
    </div>
  );
}
