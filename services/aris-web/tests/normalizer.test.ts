import { describe, expect, it } from 'vitest';
import { classifyEventKind, normalizeEvents, normalizeSessions } from '@/lib/happy/normalizer';

describe('classifyEventKind', () => {
  it('classifies command execution events', () => {
    const kind = classifyEventKind({ type: 'tool-call', text: '$ npm test\nexit code: 0' });
    expect(kind).toBe('command_execution');
  });

  it('classifies code write events', () => {
    const kind = classifyEventKind({ type: 'diff', text: 'modified 3 files' });
    expect(kind).toBe('code_write');
  });

  it('classifies code read events', () => {
    const kind = classifyEventKind({ type: 'read-file', text: 'opened file: src/app.tsx' });
    expect(kind).toBe('code_read');
  });

  it('defaults text to text_reply', () => {
    const kind = classifyEventKind({ text: 'Here is a summary of changes' });
    expect(kind).toBe('text_reply');
  });
});

describe('normalizeSessions', () => {
  it('normalizes session list shape', () => {
    const sessions = normalizeSessions([
      {
        id: 's1',
        metadata: { flavor: 'claude', path: '/repo/a' },
        state: { status: 'running' },
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: 's1',
      agent: 'claude',
      status: 'running',
      projectName: '/repo/a',
    });
  });
});

describe('normalizeEvents', () => {
  it('normalizes events into UI event shape', () => {
    const events = normalizeEvents([{ id: 'e1', type: 'message', text: 'hello' }]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'e1',
      kind: 'text_reply',
      title: 'text reply',
      body: 'hello',
    });
  });
});
