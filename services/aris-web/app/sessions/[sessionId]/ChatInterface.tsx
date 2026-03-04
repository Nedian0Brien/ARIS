'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button, Card, Badge } from '@/components/ui';
import type { UiEvent, PermissionRequest } from '@/lib/happy/types';

// Response Type Renderers
const TextReply = ({ body }: { body: string }) => (
  <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
);

const CommandExecution = ({ body }: { body: string }) => {
  const lines = body.split('\n');
  const command = lines[0]?.replace('$ ', '') || '';
  const output = lines.slice(1).join('\n');
  const exitCode = body.match(/exit code: (-?\d+)/)?.[1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'var(--surface-soft)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-amber)' }}>
        <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>$</span>{command}
      </div>
      {output && (
        <pre style={{ margin: 0, padding: '0.75rem', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
          {output}
        </pre>
      )}
      {exitCode && (
        <div style={{ textAlign: 'right' }}>
          <Badge variant={exitCode === '0' ? 'emerald' : 'red'}>exit {exitCode}</Badge>
        </div>
      )}
    </div>
  );
};

const CodeAction = ({ body, kind }: { body: string; kind: 'code_read' | 'code_write' }) => {
  const lines = body.split('\n');
  const path = lines[0] || 'Unknown path';
  const code = lines.slice(1).join('\n');
  const isRead = kind === 'code_read';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div className="text-sm" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Badge variant={isRead ? 'violet' : 'emerald'}>{isRead ? 'READ' : 'WRITE'}</Badge>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{path}</span>
      </div>
      {code && (
        <pre style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
          {code}
        </pre>
      )}
    </div>
  );
};

export function ChatInterface({
  sessionId,
  initialEvents,
  initialPermissions,
  isOperator,
  projectName,
  agentFlavor
}: {
  sessionId: string;
  initialEvents: UiEvent[];
  initialPermissions: PermissionRequest[];
  isOperator: boolean;
  projectName: string;
  agentFlavor: string;
}) {
  const { events, addEvent } = useSessionEvents(sessionId, initialEvents);
  const { pendingPermissions, decidePermission } = usePermissions(sessionId, initialPermissions);
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !isOperator || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/runtime/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: prompt,
          meta: { role: 'user' }
        }),
      });

      const body = await response.json();
      if (body.event) addEvent(body.event);
      setPrompt('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px', margin: '0 auto', width: '100%', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', background: 'var(--bg)' }}>
      {/* Session Header Info */}
      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700 }}>{projectName}</h2>
          <Badge variant="sky">{agentFlavor}</Badge>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Session: {sessionId.slice(0, 8)}...
        </div>
      </div>

      {/* Message Stream */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {events.map((event) => {
          const isUser = event.meta?.role === 'user' || event.title === 'User Instruction';
          
          return (
            <div key={event.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: isUser ? '80%' : '100%', width: isUser ? 'auto' : '100%' }} className="animate-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isUser ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {isUser ? 'YOU' : 'ARIS'}
                </span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <Card style={{ 
                padding: '1rem', 
                backgroundColor: isUser ? 'var(--primary)' : 'var(--surface)',
                color: isUser ? 'var(--text-on-accent)' : 'var(--text)',
                borderRadius: isUser ? 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)' : 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                border: isUser ? 'none' : '1px solid var(--line)',
                boxShadow: isUser ? 'var(--shadow-sm)' : 'none'
              }}>
                {event.kind === 'text_reply' && <TextReply body={event.body} />}
                {event.kind === 'command_execution' && <CommandExecution body={event.body} />}
                {event.kind === 'code_read' && <CodeAction body={event.body} kind="code_read" />}
                {event.kind === 'code_write' && <CodeAction body={event.body} kind="code_write" />}
                {event.kind === 'unknown' && <TextReply body={event.body || event.title} />}
              </Card>
            </div>
          );
        })}
      </div>

      {/* Permission Strip */}
      {pendingPermissions.length > 0 && (
        <div style={{ padding: '1rem 1.5rem', background: 'var(--accent-amber-bg)', borderTop: '1px solid var(--accent-amber)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-amber)' }}>PENDING PERMISSIONS</div>
          {pendingPermissions.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <code style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.5)', padding: '0.25rem 0.5rem', borderRadius: '4px', flex: 1 }}>{p.command}</code>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="secondary" onClick={() => decidePermission(p.id, 'deny')} style={{ minHeight: '32px', fontSize: '0.75rem' }}>Deny</Button>
                <Button onClick={() => decidePermission(p.id, 'allow_once')} style={{ minHeight: '32px', fontSize: '0.75rem', background: 'var(--accent-amber)' }}>Allow</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
            placeholder={isOperator ? "명령을 입력하세요... (⌘ + Enter)" : "Viewer 권한입니다."}
            disabled={!isOperator || isSubmitting}
            style={{
              width: '100%',
              minHeight: '80px',
              maxHeight: '200px',
              padding: '0.75rem 1rem',
              paddingBottom: '3rem',
              background: 'var(--surface-soft)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <Button 
              type="submit" 
              disabled={!prompt.trim() || !isOperator} 
              isLoading={isSubmitting}
              style={{ minHeight: '32px', padding: '0 1rem', fontSize: '0.75rem' }}
            >
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
