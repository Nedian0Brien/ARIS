import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { runAgentSessionImportOnce } from '../src/runtime/import/agentSessionImportWorker.js';

describe('agent session import worker', () => {
  it('discovers matching Codex sessions without creating chats when no user id is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-worker-'));
    const sessionDir = join(root, '.codex/sessions/2026/07/07');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'rollout-2026-07-07T00-00-00-codex.jsonl'), [
      '{"timestamp":"2026-07-07T00:00:00.000Z","type":"session_meta","payload":{"id":"codex-session-1","cwd":"/home/ubuntu/project/ARIS"}}',
      '{"timestamp":"2026-07-07T00:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"요청"}]}}',
    ].join('\n'));
    const store = {
      discoverImportedAgentSession: vi.fn().mockResolvedValue({ id: 'import-1', chatId: null }),
      resolveProjectSessionIdByPath: vi.fn(),
      ensureImportedAgentChat: vi.fn(),
      appendImportedAgentEvents: vi.fn(),
    };

    const result = await runAgentSessionImportOnce({
      store,
      projectPath: '/home/ubuntu/project/ARIS',
      codexHome: join(root, '.codex'),
      claudeHome: join(root, '.claude'),
      lookbackDays: 7,
      maxFiles: 10,
      maxBytes: 200_000,
      tailTurns: 3,
    });

    expect(result.discovered).toBe(1);
    expect(result.importedEvents).toBe(0);
    expect(store.discoverImportedAgentSession).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'codex',
      providerSessionId: 'codex-session-1',
      projectPath: '/home/ubuntu/project/ARIS',
    }));
    expect(store.ensureImportedAgentChat).not.toHaveBeenCalled();
  });

  it('creates a chat and imports only the tail when user id is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-worker-'));
    const sessionDir = join(root, '.claude/projects/-home-ubuntu-project-ARIS');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, '11111111-1111-1111-1111-111111111111.jsonl'), [
      '{"type":"user","message":{"role":"user","content":"첫 번째 요청"},"uuid":"u1","timestamp":"2026-07-07T00:00:01.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"11111111-1111-1111-1111-111111111111"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"첫 번째 답변"}]},"uuid":"a1","timestamp":"2026-07-07T00:00:02.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"11111111-1111-1111-1111-111111111111"}',
      '{"type":"user","message":{"role":"user","content":"두 번째 요청"},"uuid":"u2","timestamp":"2026-07-07T00:00:03.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"11111111-1111-1111-1111-111111111111"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"두 번째 답변"}]},"uuid":"a2","timestamp":"2026-07-07T00:00:04.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"11111111-1111-1111-1111-111111111111"}',
    ].join('\n'));
    const store = {
      discoverImportedAgentSession: vi.fn().mockResolvedValue({ id: 'import-1', chatId: null }),
      resolveProjectSessionIdByPath: vi.fn().mockResolvedValue('project-session-1'),
      ensureImportedAgentChat: vi.fn().mockResolvedValue({ chatId: 'chat-1' }),
      appendImportedAgentEvents: vi.fn().mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]),
    };

    const result = await runAgentSessionImportOnce({
      store,
      projectPath: '/home/ubuntu/project/ARIS',
      userId: 'user-1',
      codexHome: join(root, '.codex'),
      claudeHome: join(root, '.claude'),
      lookbackDays: 7,
      maxFiles: 10,
      maxBytes: 200_000,
      tailTurns: 1,
    });

    expect(result.discovered).toBe(1);
    expect(result.importedEvents).toBe(2);
    expect(store.ensureImportedAgentChat).toHaveBeenCalledWith(expect.objectContaining({
      importId: 'import-1',
      arisSessionId: 'project-session-1',
      userId: 'user-1',
    }));
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'chat-1',
      messages: [
        expect.objectContaining({ text: '두 번째 요청' }),
        expect.objectContaining({ text: '두 번째 답변' }),
      ],
    }));
  });
});
