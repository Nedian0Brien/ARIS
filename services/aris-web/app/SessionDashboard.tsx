'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, Badge } from '@/components/ui';
import type { SessionSummary } from '@/lib/happy/types';

export function SessionDashboard({ 
  initialSessions, 
  isOperator 
}: { 
  initialSessions: SessionSummary[]; 
  isOperator: boolean;
}) {
  const [newPath, setNewPath] = useState('');
  const [newAgent, setNewAgent] = useState<SessionSummary['agent']>('claude');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!isOperator) return;
    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch('/api/runtime/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath, agent: newAgent }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? '세션 생성에 실패했습니다.');
      }

      router.push(`/sessions/${body.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
      <section>
        <h2 className="title-md" style={{ marginBottom: '1.5rem' }}>Active Sessions</h2>
        
        {initialSessions.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', borderStyle: 'dashed' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🍃</div>
            <p className="text-muted">실행 중인 세션이 없습니다. 오른쪽에서 새 세션을 시작하세요.</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {initialSessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="animate-in" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'transform 0.2s' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                      {session.agent === 'claude' ? '🧠' : '💻'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{session.projectName}</div>
                      <div className="text-sm text-muted">
                        Agent: {session.agent} • Updated: {new Date(session.lastActivityAt || '').toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                      {session.status}
                    </Badge>
                    <span style={{ color: 'var(--line-strong)' }}>→</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <aside>
        <Card style={{ padding: '1.5rem' }}>
          <h3 className="title-sm" style={{ marginBottom: '1.25rem', fontWeight: 700 }}>New Workspace</h3>
          <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Project Path</label>
              <Input 
                value={newPath} 
                onChange={(e) => setNewPath(e.target.value)} 
                placeholder="/absolute/path/to/project"
                required
                disabled={!isOperator}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Agent Flavor</label>
              <select 
                className="input" 
                value={newAgent} 
                onChange={(e) => setNewAgent(e.target.value as SessionSummary['agent'])}
                disabled={!isOperator}
                style={{ appearance: 'none' }}
              >
                <option value="claude">Claude (Recommended)</option>
                <option value="gemini">Gemini</option>
                <option value="codex">Codex</option>
              </select>
            </div>

            {error && <div className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</div>}
            
            <Button type="submit" isLoading={isCreating} disabled={!isOperator}>
              Start Session
            </Button>
            
            {!isOperator && (
              <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                Viewer 권한으로는 세션을 생성할 수 없습니다.
              </p>
            )}
          </form>
        </Card>

        <Card style={{ padding: '1.5rem', marginTop: '1.5rem', backgroundColor: 'var(--accent-sky-bg)', border: '1px solid var(--accent-sky-bg)' }}>
          <h4 className="text-sm" style={{ fontWeight: 700, color: 'var(--accent-sky)', marginBottom: '0.5rem' }}>Host Access Mode</h4>
          <p className="text-sm" style={{ color: 'var(--accent-sky)', opacity: 0.8 }}>
            에이전트가 호스트 시스템의 Nginx 설정 및 파일에 직접 접근하여 작업을 수행합니다.
          </p>
        </Card>
      </aside>
    </div>
  );
}
