import { withAppBasePath } from '@/lib/routing/appPath';

export function redirectToLoginWithNext(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname === '/login' || window.location.pathname === withAppBasePath('/login')) {
    return;
  }

  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = withAppBasePath(`/login?next=${encodeURIComponent(next)}`);
}
