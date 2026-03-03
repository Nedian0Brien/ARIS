import Link from 'next/link';
import type { AuthenticatedUser } from '@/lib/auth/types';

export function TopBar({ user }: { user: AuthenticatedUser }) {
  return (
    <header className="topbar">
      <div className="row topbar-left">
        <Link href="/" className="brand">
          ARIS
        </Link>
        <Link href="/" className="muted nav-link">
          Agent Workspace
        </Link>
        <Link href="/ssh" className="muted nav-link">
          SSH Fallback
        </Link>
      </div>
      <div className="row topbar-right">
        <span className="muted">{user.email}</span>
        <span className={`chip ${user.role === 'operator' ? 'ok' : 'subtle'}`}>{user.role}</span>
        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
