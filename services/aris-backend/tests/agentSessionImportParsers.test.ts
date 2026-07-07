import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseClaudeSessionLog,
  parseCodexSessionLog,
  selectTailMessages,
} from '../src/runtime/import/providerSessionImportParsers.js';

const fixturesDir = join(process.cwd(), 'tests/fixtures/import');

describe('agent session import parsers', () => {
  it('extracts Codex metadata and only conversational messages', async () => {
    const contents = await readFile(join(fixturesDir, 'codex-session-tail.jsonl'), 'utf8');

    const parsed = parseCodexSessionLog(contents, {
      sourcePath: '/home/ubuntu/.codex/sessions/2026/07/07/rollout.jsonl',
    });

    expect(parsed.provider).toBe('codex');
    expect(parsed.providerSessionId).toBe('codex-session-1');
    expect(parsed.projectPath).toBe('/home/ubuntu/project/ARIS');
    expect(parsed.messages.map((message) => message.text)).toEqual([
      '첫 번째 요청',
      '첫 번째 답변',
      '두 번째 요청',
      '두 번째 답변',
      '세 번째 요청',
      '세 번째 답변',
    ]);
    expect(parsed.messages.some((message) => message.text.includes('secret'))).toBe(false);
    expect(parsed.messages[0]?.sourceEventKey).toContain('codex-session-1');
  });

  it('extracts Claude messages while ignoring internal and tool-only payloads', async () => {
    const contents = await readFile(join(fixturesDir, 'claude-session-tail.jsonl'), 'utf8');

    const parsed = parseClaudeSessionLog(contents, {
      sourcePath: '/home/ubuntu/.claude/projects/-home-ubuntu-project-ARIS/11111111-1111-1111-1111-111111111111.jsonl',
      fallbackSessionId: '11111111-1111-1111-1111-111111111111',
    });

    expect(parsed.provider).toBe('claude');
    expect(parsed.providerSessionId).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsed.projectPath).toBe('/home/ubuntu/project/ARIS');
    expect(parsed.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:첫 번째 요청',
      'assistant:첫 번째 답변',
      'user:두 번째 요청',
      'assistant:두 번째 답변',
    ]);
    expect(parsed.messages.some((message) => message.text.includes('secret'))).toBe(false);
  });

  it('selects only the last requested turns', async () => {
    const contents = await readFile(join(fixturesDir, 'codex-session-tail.jsonl'), 'utf8');
    const parsed = parseCodexSessionLog(contents, { sourcePath: 'codex.jsonl' });

    const tail = selectTailMessages(parsed.messages, 2);

    expect(tail.map((message) => message.text)).toEqual([
      '두 번째 요청',
      '두 번째 답변',
      '세 번째 요청',
      '세 번째 답변',
    ]);
    expect(tail[0]?.sourceOffset).toBeGreaterThan(0n);
  });
});
