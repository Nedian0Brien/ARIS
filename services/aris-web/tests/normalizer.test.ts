import { describe, expect, it } from 'vitest';
import { classifyEventKind, normalizeEvents, normalizeSessions } from '@/lib/happy/normalizer';

describe('classifyEventKind', () => {
  it('classifies run execution events', () => {
    const kind = classifyEventKind({ type: 'tool-call', text: '$ npm test\nexit code: 0' });
    expect(kind).toBe('run_execution');
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

  it('reclassifies mis-tagged file_read commands with write intent to file_write', () => {
    const kind = classifyEventKind({
      type: 'file_read',
      command: '/bin/bash -lc "cd /tmp/work && sed -n \'1,120p\' a.ts && mkdir -p prisma/migrations && cat > prisma/migrations/001_init.sql <<\'SQL\'"',
    });
    expect(kind).toBe('file_write');
  });

  it('detects echo/printf redirects without spaces as file_write', () => {
    const echoKind = classifyEventKind({
      type: 'file_read',
      command: '/bin/bash -lc "echo hello>out.txt"',
    });
    const printfKind = classifyEventKind({
      type: 'file_read',
      command: '/bin/bash -lc "printf %s\\\\n hello>>out.txt"',
    });

    expect(echoKind).toBe('file_write');
    expect(printfKind).toBe('file_write');
  });

  it('detects redirects with spaces as file_write', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      command: '/bin/bash -lc "sed -n \'1,120p\' src/app.ts > out.txt"',
    });
    expect(kind).toBe('file_write');
  });

  it('overrides file_list type when command has write intent', () => {
    const kind = classifyEventKind({
      type: 'file_list',
      command: '/bin/bash -lc "ls -la && echo hello > out.txt"',
    });
    expect(kind).toBe('file_write');
  });

  it('detects multiline bash -lc writes as file_write', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      command: '/bin/bash -lc "echo hello > out.txt\\ncat out.txt"',
    });
    expect(kind).toBe('file_write');
  });

  it('does not treat quoted greater-than in echo as write intent', () => {
    const kind = classifyEventKind({
      type: 'file_read',
      command: '/bin/bash -lc \'echo "a > b"\'',
    });
    expect(kind).toBe('file_read');
  });

  it('classifies docker commands as docker_execution', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      command: 'docker exec aris-web sh -lc "node -v"',
    });
    expect(kind).toBe('docker_execution');
  });

  it('classifies git commands as git_execution', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      command: 'git status --short',
    });
    expect(kind).toBe('git_execution');
  });

  it('defaults text to text_reply', () => {
    const kind = classifyEventKind({ text: 'Here is a summary of changes' });
    expect(kind).toBe('text_reply');
  });

  it('classifies apply_patch text hints as file_write even without command field', () => {
    const kind = classifyEventKind({
      type: 'command_execution',
      text: 'apply_patch completed successfully',
    });
    expect(kind).toBe('file_write');
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

  it('overrides file_read meta when command contains explicit write operations', () => {
    const events = normalizeEvents([
      {
        id: 'e3b',
        type: 'message',
        text: '$ /bin/bash -lc "cd /tmp/work && sed -n \'1,120p\' a.ts && mkdir -p prisma/migrations && cat > prisma/migrations/001_init.sql <<\'SQL\'"',
        meta: { actionType: 'file_read' },
      },
    ]);

    expect(events[0].kind).toBe('file_write');
  });

  it('overrides command_execution meta when command contains redirect with spaces', () => {
    const events = normalizeEvents([
      {
        id: 'e3d',
        type: 'message',
        text: '$ /bin/bash -lc "sed -n \'1,120p\' src/app.ts > out.txt"',
        meta: { actionType: 'command_execution' },
      },
    ]);

    expect(events[0].kind).toBe('file_write');
  });

  it('overrides file_list meta when command contains write operations', () => {
    const events = normalizeEvents([
      {
        id: 'e3e',
        type: 'message',
        text: '$ /bin/bash -lc "ls -la && echo hello > out.txt"',
        meta: { actionType: 'file_list' },
      },
    ]);

    expect(events[0].kind).toBe('file_write');
  });

  it('keeps file_read meta when command only contains quoted greater-than', () => {
    const events = normalizeEvents([
      {
        id: 'e3c',
        type: 'message',
        text: '$ /bin/bash -lc \'echo "a > b"\'',
        meta: { actionType: 'file_read' },
      },
    ]);

    expect(events[0].kind).toBe('file_read');
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

  it('classifies command_execution meta to docker_execution for docker commands', () => {
    const events = normalizeEvents([
      {
        id: 'e5',
        type: 'message',
        text: '$ docker compose ps',
        meta: { actionType: 'command_execution' },
      },
    ]);

    expect(events[0].kind).toBe('docker_execution');
    expect(events[0].action?.command).toBe('docker compose ps');
  });

  it('classifies apply_patch text as file_write when command extraction is unavailable', () => {
    const events = normalizeEvents([
      {
        id: 'e6',
        type: 'message',
        text: 'apply_patch completed successfully',
        meta: { actionType: 'command_execution' },
      },
    ]);

    expect(events[0].kind).toBe('file_write');
  });
});
