import { LoginForm } from '@/app/login/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  const nextPath = query.next && query.next.startsWith('/') ? query.next : '/';

  return (
    <main className="login-page">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
