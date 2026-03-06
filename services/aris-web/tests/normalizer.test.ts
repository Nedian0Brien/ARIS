import { describe, expect, it } from 'vitest';
import { classifyEventKind, normalizeEvents, normalizeSessions } from '@/lib/happy/normalizer';

describe('classifyEventKind', () => {
  it('classifies command execution events', () => {
    const kind = classifyEventKind({ type: 'tool-call', text: '$ npm test\nexit code: 0' });
    expect(kind).toBe('command_execution');
  });

  it('classifies file write events', () => {
    const kind = classifyEventKind({ type: 'diff', text: 'modified 3 files' });
    expect(kind).toBe('file_write');
  });

  it('classifies file read events', () => {
    const kind = classifyEventKind({ type: 'read-file', text: 'opened file: src/app.tsx' });
    expect(kind).toBe('file_read');
  });

  it('classifies file list events', () => {
    const kind = classifyEventKind({ type: 'tool-call', text: '$ rg --files src\nindex.ts\napp.tsx' });
    expect(kind).toBe('file_list');
  });

  it('classifies read-only shell commands as file_read', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      command: '/bin/bash -lc "sed -n \'1,260p\' services/web-editor/frontend/src/components/App.tsx"',
    });
    expect(kind).toBe('file_read');
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

  it('builds action and result payload for command output previews', () => {
    const events = normalizeEvents([
      { id: 'e2', type: 'tool-call', text: '$ ls src\nindex.ts\napp.tsx\nutils.ts' },
    ]);
    expect(events[0].kind).toBe('file_list');
    expect(events[0].action?.command).toBe('ls src');
    expect(events[0].result?.preview).toContain('index.ts');
  });

  it('prioritizes explicit meta actionType over text heuristics', () => {
    const events = normalizeEvents([
      {
        id: 'e3',
        type: 'message',
        text: '$ cat src/app.tsx',
        meta: { actionType: 'file_read', path: 'src/app.tsx' },
      },
    ]);

    expect(events[0].kind).toBe('file_read');
    expect(events[0].action?.path).toBe('src/app.tsx');
  });

  it('reclassifies command_execution meta to file_read for read-only command patterns', () => {
    const events = normalizeEvents([
      {
        id: 'e4',
        type: 'message',
        text: '$ /bin/bash -lc "sed -n \'1,120p\' services/web-editor/frontend/src/components/App.tsx"',
        meta: { actionType: 'command_execution' },
      },
    ]);

    expect(events[0].kind).toBe('file_read');
    expect(events[0].action?.path).toBe('services/web-editor/frontend/src/components/App.tsx');
  });
});
