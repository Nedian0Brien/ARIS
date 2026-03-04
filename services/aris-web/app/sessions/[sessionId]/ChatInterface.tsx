'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button, Card, Badge } from '@/components/ui';
import { Send, TerminalSquare, FileCode2, Code, ShieldAlert, Cpu } from 'lucide-react';
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'var(--surface-soft)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <TerminalSquare size={16} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-muted)', marginRight: '0.25rem' }}>$</span>{command}
      </div>
      {output && (
        <pre className="no-scrollbar" style={{ margin: 0, padding: '0.75rem', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
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
        <Badge variant={isRead ? 'violet' : 'emerald'}>
          {isRead ? <FileCode2 size={12} /> : <Code size={12} />}
          {isRead ? 'READ' : 'WRITE'}
        </Badge>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', wordBreak: 'break-all' }}>{path}</span>
      </div>
      {code && (
        <pre className="no-scrollbar" style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
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
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectName}</h2>
          <Badge variant="sky">
            <Cpu size={12} />
            {agentFlavor}
          </Badge>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '1rem' }}>
          {sessionId.slice(0, 8)}...
        </div>
      </div>

      {/* Message Stream */}
      <div className="chat-stream-container no-scrollbar" ref={scrollRef}>
        {events.map((event) => {
          const isUser = event.meta?.role === 'user' || event.title === 'User Instruction';
          
          return (
            <div key={event.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: isUser ? '85%' : '100%', width: isUser ? 'auto' : '100%' }} className="animate-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: isUser ? 'flex-end' : 'flex-start', padding: '0 0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isUser ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {isUser ? 'YOU' : 'ARIS'}
                </span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        <div className="animate-in" style={{ padding: '1rem', background: 'var(--accent-amber-bg)', borderTop: '1px solid var(--accent-amber)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <ShieldAlert size={16} /> PENDING PERMISSIONS
          </div>
          {pendingPermissions.map((p) => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <code style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.6)', padding: '0.375rem 0.5rem', borderRadius: '4px', wordBreak: 'break-all' }}>{p.command}</code>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="secondary" onClick={() => decidePermission(p.id, 'deny')} style={{ flex: 1, minHeight: '36px', fontSize: '0.75rem' }}>Deny</Button>
                <Button onClick={() => decidePermission(p.id, 'allow_once')} style={{ flex: 1, minHeight: '36px', fontSize: '0.75rem', background: 'var(--accent-amber)', color: '#fff', border: 'none' }}>Allow</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--line)', background: 'var(--surface)', zIndex: 10 }}>
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
              minHeight: '60px',
              maxHeight: '150px',
              padding: '0.75rem 1rem',
              paddingRight: '4rem',
              background: 'var(--surface-soft)',
              border: '1px solid transparent',
              borderRadius: 'var(--radius-lg)',
              fontSize: '0.875rem',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
            onBlur={(e) => e.target.style.borderColor = 'transparent'}
          />
          <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}>
            <Button 
              type="submit" 
              disabled={!prompt.trim() || !isOperator} 
              isLoading={isSubmitting}
              style={{ width: '36px', height: '36px', padding: 0, minHeight: 'auto', borderRadius: 'var(--radius-full)' }}
              title="Send message"
            >
              {!isSubmitting && <Send size={16} />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
