import { afterEach, describe, expect, it } from 'vitest';
import { appendFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ClaudeSessionLogTracker, extractClaudeSessionHintIds, scanClaudeSessionLogs } from '../src/runtime/providers/claude/claudeSessionScanner.js';

function buildProjectDir(rootDir: string, workingDirectory: string): string {
  const projectId = resolve(workingDirectory).replace(/[^a-zA-Z0-9-]/g, '-');
  return join(rootDir, 'projects', projectId);
}

describe('claudeSessionScanner', () => {
  let tempClaudeDir = '';
  const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

  afterEach(async () => {
    if (tempClaudeDir) {
      await rm(tempClaudeDir, { recursive: true, force: true });
      tempClaudeDir = '';
    }
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
  });

  it('extracts hinted session ids from Claude CLI args', () => {
    expect(extractClaudeSessionHintIds([
      '--print',
      '--session-id',
      '11111111-2222-4333-8444-555555555555',
      '--resume',
      'session-live-123',
    ])).toEqual([
      '11111111-2222-4333-8444-555555555555',
      'session-live-123',
    ]);
  });

  it('prefers an existing hinted session log', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-scanner-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/tmp/project-alpha';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, '11111111-2222-4333-8444-555555555555.jsonl'), [
      JSON.stringify({ type: 'system', uuid: 'sys-1', sessionId: '11111111-2222-4333-8444-555555555555' }),
      JSON.stringify({ type: 'assistant', uuid: 'msg-1', sessionId: '11111111-2222-4333-8444-555555555555', message: { content: [{ type: 'text', text: 'hello' }] } }),
    ].join('\n'));

    const scanned = await scanClaudeSessionLogs({
      workingDirectory,
      hintedSessionIds: ['11111111-2222-4333-8444-555555555555'],
    });

    expect(scanned.sessionId).toBe('11111111-2222-4333-8444-555555555555');
    expect(scanned.source).toBe('hinted-log');
  });

  it('falls back to the most recent valid session log when hints are missing', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-scanner-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/tmp/project-beta';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });

    const olderSession = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const newerSession = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    await writeFile(join(projectDir, `${olderSession}.jsonl`), JSON.stringify({
      type: 'assistant',
      uuid: 'msg-old',
      sessionId: olderSession,
      message: { content: [{ type: 'text', text: 'older' }] },
    }));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    await writeFile(join(projectDir, `${newerSession}.jsonl`), JSON.stringify({
      type: 'assistant',
      uuid: 'msg-new',
      sessionId: newerSession,
      message: { content: [{ type: 'text', text: 'newer' }] },
    }));

    const scanned = await scanClaudeSessionLogs({
      workingDirectory,
      hintedSessionIds: [],
    });

    expect(scanned.sessionId).toBe(newerSession);
    expect(scanned.source).toBe('recent-log');
  });

  it('tails new events incrementally and dedupes already processed lines', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-scanner-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/tmp/project-gamma';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });

    const sessionId = 'cccccccc-3333-4333-8333-cccccccccccc';
    const logPath = join(projectDir, `${sessionId}.jsonl`);
    await writeFile(logPath, JSON.stringify({
      type: 'assistant',
      uuid: 'msg-1',
      sessionId,
      message: { content: [{ type: 'text', text: 'first' }] },
    }));

    const tracker = new ClaudeSessionLogTracker({
      workingDirectory,
      hintedSessionIds: [sessionId],
    });
    const first = await tracker.poll();
    expect(first.events).toHaveLength(1);
    expect(first.currentSessionId).toBe(sessionId);

    const second = await tracker.poll();
    expect(second.events).toHaveLength(0);

    await appendFile(logPath, `\n${JSON.stringify({
      type: 'assistant',
      uuid: 'msg-2',
      sessionId,
      message: { content: [{ type: 'text', text: 'second' }] },
    })}`);

    const third = await tracker.poll();
    expect(third.events).toHaveLength(1);
    expect(third.events[0]?.eventKey).toBe(`${sessionId}:msg-2`);
  });

  it('tracks pending and finished sessions while stitching resume targets', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-scanner-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/tmp/project-delta';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });

    const firstSession = 'dddddddd-4444-4444-8444-dddddddddddd';
    const secondSession = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
    await writeFile(join(projectDir, `${firstSession}.jsonl`), JSON.stringify({
      type: 'assistant',
      uuid: 'msg-1',
      sessionId: firstSession,
      message: { content: [{ type: 'text', text: 'first session' }] },
    }));

    const tracker = new ClaudeSessionLogTracker({
      workingDirectory,
      hintedSessionIds: [firstSession],
    });
    const first = await tracker.poll();
    expect(first.currentSessionId).toBe(firstSession);
    expect(first.pendingSessionIds).toEqual([]);

    await writeFile(join(projectDir, `${secondSession}.jsonl`), JSON.stringify({
      type: 'assistant',
      uuid: 'msg-2',
      sessionId: secondSession,
      message: { content: [{ type: 'text', text: 'second session' }] },
    }));
    tracker.trackSessionIds([secondSession]);

    const second = await tracker.poll();
    expect(second.currentSessionId).toBe(secondSession);
    expect(second.finishedSessionIds).toContain(firstSession);
  });
});
