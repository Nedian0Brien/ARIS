'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, Badge } from '@/components/ui';
import { DirectoryModal } from '@/components/ui/DirectoryModal';
import { Play, Terminal, BrainCircuit, FolderOpen, Search, PlusCircle, X, Plus } from 'lucide-react';
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
  const [isDirModalOpen, setIsDirModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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

  const createModal = isCreateModalOpen && mounted ? createPortal(
    <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
      <div className="modal-content animate-in" onClick={(e) => e.stopPropagation()} style={{ padding: 0 }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="title-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={20} color="var(--primary)" /> New Workspace
          </h3>
          <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '0.25rem', minHeight: 'auto', borderRadius: 'var(--radius-full)' }}>
            <X size={20} />
          </Button>
        </div>
        
        <form onSubmit={handleCreateSession} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                onClick={() => setIsDirModalOpen(true)}
                disabled={!isOperator}
                style={{ padding: '0 0.75rem' }}
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
          
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ flex: 1 }}>취소</Button>
            <Button type="submit" isLoading={isCreating} disabled={!isOperator || !newPath} style={{ flex: 2 }}>
              <Play size={16} fill="currentColor" /> Start Session
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 className="title-md" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={24} color="var(--primary)" /> Active Sessions
        </h2>
        {isOperator && (
          <Button 
            onClick={() => setIsCreateModalOpen(true)} 
            className="desktop-create-button"
          >
            <Plus size={18} /> 새 세션
          </Button>
        )}
      </div>
      
      <div className="animate-in">
        {initialSessions.length === 0 ? (
          <Card style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              <FolderOpen size={68} strokeWidth={1.5} />
            </div>
            <h3 className="title-sm" style={{ marginBottom: '0.5rem' }}>활성화된 세션이 없습니다</h3>
            <p className="text-muted text-sm" style={{ margin: '0 auto', maxWidth: '320px' }}>
              아직 실행 중인 세션이 없습니다. 프로젝트 경로를 지정해서 첫 세션을 시작해 보세요.
            </p>
            <Button 
              onClick={() => setIsCreateModalOpen(true)} 
              disabled={!isOperator}
              className="hidden-mobile empty-state-primary-action"
            >
              <PlusCircle size={18} /> 첫 세션 시작하기
            </Button>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {initialSessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', cursor: 'pointer', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {session.agent === 'claude' ? <BrainCircuit size={24} color="var(--accent-violet)" /> : <Terminal size={24} color="var(--primary)" />}
                    </div>
                    <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                      {session.status}
                    </Badge>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem', wordBreak: 'break-all' }}>{session.projectName}</div>
                    <div className="text-sm text-muted">
                      {session.agent.toUpperCase()} Agent
                    </div>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="text-sm text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(session.lastActivityAt || '').toLocaleDateString()}
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      워크스페이스 <Play size={14} fill="currentColor" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button for Mobile */}
      <div className="fab" onClick={() => setIsCreateModalOpen(true)}>
        <Plus size={28} />
      </div>

      {createModal}
      
      <DirectoryModal 
        isOpen={isDirModalOpen} 
        onClose={() => setIsDirModalOpen(false)} 
        onSelect={(path) => setNewPath(path)} 
      />

      <style jsx>{`
        .desktop-create-button {
          display: none;
        }

        .empty-state-primary-action {
          display: inline-flex;
          width: fit-content;
          margin: 2rem auto 0;
        }

        @media (min-width: 768px) {
          .desktop-create-button { display: inline-flex !important; }
          .empty-state-primary-action { display: inline-flex !important; }
        }
      `}</style>
    </div>
  );
}
