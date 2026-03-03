import { useState } from 'react';
import type { SessionAction } from '@/lib/happy/types';

const MODES = ['ask', 'plan', 'execute'] as const;
const INTENTS = ['fix', 'refactor', 'debug', 'test', 'ship'] as const;
const CONSTRAINTS = ['safe', 'fast', 'tests-required', 'minimal-diff'] as const;
const SESSION_ACTIONS: SessionAction[] = ['abort', 'retry', 'kill', 'resume'];

export function ChatComposer({
  onSubmit,
  onAction,
  disabled,
  isSubmitting,
  loadingAction,
}: {
  onSubmit: (text: string, mode: string, intents: string[], constraints: string[]) => void;
  onAction: (action: SessionAction) => void;
  disabled: boolean;
  isSubmitting: boolean;
  loadingAction: string | null;
}) {
  const [mode, setMode] = useState<(typeof MODES)[number]>('ask');
  const [intents, setIntents] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');

  const toggleList = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (list.includes(item)) setter(list.filter((x) => x !== item));
    else setter([...list, item]);
  };

  const handleSend = () => {
    if (!prompt.trim()) return;
    onSubmit(prompt, mode, intents, constraints);
    setPrompt('');
  };

  return (
    <section className="card" style={{ 
      position: 'sticky', 
      bottom: '1.5rem', 
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      padding: '1rem',
      boxShadow: 'var(--shadow-md)',
      marginTop: '1rem'
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            onClick={() => setMode(m)}
            style={{
              border: mode === m ? '1px solid #3b82f6' : '1px solid var(--line)',
              backgroundColor: mode === m ? '#eff6ff' : '#fff',
              color: mode === m ? '#1d4ed8' : 'var(--text)',
              cursor: 'pointer',
              minHeight: '32px'
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
        <div style={{ width: '1px', backgroundColor: 'var(--line)', margin: '0 0.25rem' }} />
        {INTENTS.map((i) => {
          const active = intents.includes(i);
          return (
            <button
              key={i}
              type="button"
              className="chip"
              onClick={() => toggleList(intents, i, setIntents)}
              style={{
                border: active ? '1px solid #10b981' : '1px solid var(--line)',
                backgroundColor: active ? '#ecfdf5' : '#fff',
                color: active ? '#047857' : 'var(--muted)',
                cursor: 'pointer',
                minHeight: '32px'
              }}
            >
              {i}
            </button>
          );
        })}
      </div>
      
      {constraints.length > 0 || true ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {CONSTRAINTS.map((c) => {
            const active = constraints.includes(c);
            return (
              <button
                key={c}
                type="button"
                className="chip"
                onClick={() => toggleList(constraints, c, setConstraints)}
                style={{
                  border: active ? '1px solid #f59e0b' : '1px dashed var(--line)',
                  backgroundColor: active ? '#fffbeb' : '#fafafa',
                  color: active ? '#b45309' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  minHeight: '28px'
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      ) : null}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Type an instruction..."
        disabled={disabled}
        style={{
          minHeight: '80px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem',
          fontSize: '0.875rem',
          backgroundColor: '#fafafa'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="primary" 
            onClick={handleSend} 
            disabled={disabled || isSubmitting || !prompt.trim()}
          >
            {isSubmitting ? 'Sending...' : 'Send (⌘+Enter)'}
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {SESSION_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="secondary"
              disabled={disabled || loadingAction !== null}
              onClick={() => onAction(action)}
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.75rem',
                minHeight: '32px',
                color: action === 'abort' || action === 'kill' ? '#b91c1c' : 'inherit'
              }}
            >
              {loadingAction === action ? '...' : action}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
