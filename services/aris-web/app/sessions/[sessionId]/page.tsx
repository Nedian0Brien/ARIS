import { redirect } from 'next/navigation';

export default async function LegacySessionRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ ssh_command?: string; ssh_expires_at?: string }>;
}) {
  const { sessionId } = await params;
  const query = await searchParams;

  const url = new URL(`http://localhost/?session=${encodeURIComponent(sessionId)}`);
  if (query.ssh_command) {
    url.searchParams.set('ssh_command', query.ssh_command);
  }
  if (query.ssh_expires_at) {
    url.searchParams.set('ssh_expires_at', query.ssh_expires_at);
  }

  redirect(`${url.pathname}${url.search}`);
}
