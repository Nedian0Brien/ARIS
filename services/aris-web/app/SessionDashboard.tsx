'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, Badge } from '@/components/ui';
import { DirectoryModal } from '@/components/ui/DirectoryModal';
import { Play, Terminal, BrainCircuit, Box, Search, PlusCircle } from 'lucide-react';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    <div className="dashboard-grid">
      <section>
        <h2 className="title-md" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={24} color="var(--primary)" /> Active Sessions
        </h2>
        
        {initialSessions.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              <Box size={48} strokeWidth={1} />
            </div>
            <p className="text-muted">실행 중인 세션이 없습니다. 오른쪽에서 새 세션을 시작하세요.</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {initialSessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="animate-in" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {session.agent === 'claude' ? <BrainCircuit size={20} color="var(--accent-violet)" /> : <Terminal size={20} color="var(--primary)" />}
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.projectName}</div>
                      <div className="text-sm text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ textTransform: 'capitalize' }}>{session.agent}</span> • Updated: {new Date(session.lastActivityAt || '').toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                      {session.status}
                    </Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <aside>
        <Card style={{ padding: '1.5rem', borderTop: '4px solid var(--primary)' }}>
          <h3 className="title-sm" style={{ marginBottom: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={20} color="var(--primary)" /> New Workspace
          </h3>
          <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Project Path</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Input 
                  value={newPath} 
                  onChange={(e) => setNewPath(e.target.value)} 
                  placeholder="/workspace/my-app"
                  required
                  disabled={!isOperator}
                  style={{ flex: 1 }}
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => setIsModalOpen(true)}
                  disabled={!isOperator}
                  style={{ padding: '0 0.75rem' }}
                  title="Browse Host Directory"
                >
                  <Search size={18} />
                </Button>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Agent Flavor</label>
              <select 
                className="input" 
                value={newAgent} 
                onChange={(e) => setNewAgent(e.target.value as SessionSummary['agent'])}
                disabled={!isOperator}
                style={{ appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
              >
                <option value="claude">Claude (Recommended)</option>
                <option value="gemini">Gemini</option>
                <option value="codex">Codex</option>
              </select>
            </div>

            {error && <div className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</div>}
            
            <Button type="submit" isLoading={isCreating} disabled={!isOperator || !newPath}>
              <Play size={16} fill="currentColor" /> Start Session
            </Button>
            
            {!isOperator && (
              <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                Viewer 권한으로는 세션을 생성할 수 없습니다.
              </p>
            )}
          </form>
        </Card>
      </aside>
      
      <DirectoryModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSelect={(path) => setNewPath(path)} 
      />
    </div>
  );
}
