import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mapClaudeStreamOutputToProtocol, parseClaudeStreamOutput } from '../src/runtime/providers/claude/claudeProtocolMapper.js';
import { scanClaudeSessionLogs } from '../src/runtime/providers/claude/claudeSessionScanner.js';

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/claude/${name}`, import.meta.url), 'utf8');
}

function buildProjectDir(rootDir: string, workingDirectory: string): string {
  const projectId = resolve(workingDirectory).replace(/[^a-zA-Z0-9-]/g, '-');
  return join(rootDir, 'projects', projectId);
}

describe('claude protocol conformance', () => {
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

  it('normalizes lowercase init session ids into the canonical protocol envelope', () => {
    const streamOutput = loadFixture('init-lowercase-sessionid.jsonl');

    const parsed = parseClaudeStreamOutput(streamOutput);
    const mapped = mapClaudeStreamOutputToProtocol(streamOutput);

    expect(parsed.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.envelopes[0]).toMatchObject({
      kind: 'turn-start',
      sessionId: '9f4a171c-4f0b-4a2a-8727-5232d07a50a0',
      threadId: '9f4a171c-4f0b-4a2a-8727-5232d07a50a0',
    });
  });

  it('preserves observed session ids on init-only timeout traces', () => {
    const streamOutput = loadFixture('init-timeout-with-sessionid.jsonl');

    const parsed = parseClaudeStreamOutput(streamOutput);
    const mapped = mapClaudeStreamOutputToProtocol(streamOutput);

    expect(parsed.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes[2]).toMatchObject({
      kind: 'stop',
      reason: 'timeout',
    });
  });

  it('discovers the same observed session id from Claude logs for lowercase payload keys', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-conformance-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/tmp/project-conformance';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });
    const sessionId = '9f4a171c-4f0b-4a2a-8727-5232d07a50a0';
    await writeFile(join(projectDir, `${sessionId}.jsonl`), loadFixture('init-timeout-with-sessionid.jsonl'));

    const scanned = await scanClaudeSessionLogs({
      workingDirectory,
      hintedSessionIds: [sessionId],
    });

    expect(scanned.sessionId).toBe(sessionId);
    expect(scanned.events.map((event) => event.discoveredSessionId)).toContain(sessionId);
  });

  it('keeps observed session ids when Claude emits an aborted stop trace', () => {
    const streamOutput = loadFixture('stop-abort-with-sessionid.jsonl');

    const parsed = parseClaudeStreamOutput(streamOutput);
    const mapped = mapClaudeStreamOutputToProtocol(streamOutput);

    expect(parsed.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.sessionId).toBe('9f4a171c-4f0b-4a2a-8727-5232d07a50a0');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes[2]).toMatchObject({
      kind: 'stop',
      reason: 'aborted',
    });
  });

  it('scans a real PrismLog project trace while ignoring queue-operation noise', async () => {
    tempClaudeDir = await mkdtemp(join(tmpdir(), 'aris-claude-conformance-'));
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    const workingDirectory = '/home/ubuntu/project/PrismLog';
    const projectDir = buildProjectDir(tempClaudeDir, workingDirectory);
    await mkdir(projectDir, { recursive: true });
    const sessionId = '9f4a171c-4f0b-4a2a-8727-5232d07a50a0';
    await writeFile(join(projectDir, `${sessionId}.jsonl`), loadFixture('project-log-prismlog-mixed-session.jsonl'));

    const scanned = await scanClaudeSessionLogs({
      workingDirectory,
      hintedSessionIds: [sessionId],
    });

    expect(scanned.sessionId).toBe(sessionId);
    expect(scanned.events).toHaveLength(3);
    expect(scanned.events.every((event) => event.eventType !== 'queue-operation')).toBe(true);
    expect(scanned.events.map((event) => event.discoveredSessionId)).toEqual([
      sessionId,
      sessionId,
      sessionId,
    ]);
  });
});
