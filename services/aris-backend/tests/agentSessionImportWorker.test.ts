import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  buildImportedChatTitle,
  runAgentSessionImportOnce,
} from '../src/runtime/import/agentSessionImportWorker.js';

describe('agent session import worker', () => {
  it('derives imported chat titles from the first real user turn', () => {
    expect(buildImportedChatTitle('codex', [
      {
        role: 'user',
        text: '# AGENTS.md instructions for /home/ubuntu/project/ARIS\n\n<INSTRUCTIONS>',
        sourceEventKey: 'ctx',
        sourceOffset: 1n,
      },
      {
        role: 'user',
        text: '백엔드 런타임 API에 연결할 수 없습니다. 정상화해',
        sourceEventKey: 'user',
        sourceOffset: 2n,
      },
    ])).toBe('백엔드 런타임 API에 연결할 수 없습니다. 정상화해');
  });

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
      resolveProjectIdByPath: vi.fn(),
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
      resolveProjectIdByPath: vi.fn().mockResolvedValue('project-session-1'),
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
      arisProjectId: 'project-session-1',
      userId: 'user-1',
      title: '첫 번째 요청',
    }));
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'chat-1',
      messages: [
        expect.objectContaining({ text: '두 번째 요청' }),
        expect.objectContaining({ text: '두 번째 답변' }),
      ],
      hasMoreBefore: true,
    }));
  });

  it('syncs only messages newer than the imported cursor for linked chats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-worker-'));
    const sessionDir = join(root, '.codex/sessions/2026/07/07');
    await mkdir(sessionDir, { recursive: true });
    const sourcePath = join(sessionDir, 'rollout-2026-07-07T00-00-00-codex.jsonl');
    const lines = [
      '{"timestamp":"2026-07-07T00:00:00.000Z","type":"session_meta","payload":{"id":"codex-session-1","cwd":"/home/ubuntu/project/ARIS"}}',
      '{"timestamp":"2026-07-07T00:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"첫 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:02.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"첫 답변"}]}}',
      '{"timestamp":"2026-07-07T00:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"새 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"새 답변"}]}}',
    ];
    await writeFile(sourcePath, lines.join('\n'));
    const cursorAfterFirstTurn = BigInt(lines[0].length + 1 + lines[1].length + 1 + lines[2].length + 1) - 1n;
    const store = {
      discoverImportedAgentSession: vi.fn().mockResolvedValue({
        id: 'import-1',
        chatId: 'chat-1',
        arisProjectId: 'project-session-1',
        provider: 'codex',
        providerSessionId: 'codex-session-1',
        sourcePath,
        projectPath: '/home/ubuntu/project/ARIS',
        newestCursorOffset: cursorAfterFirstTurn,
        hasMoreBefore: true,
      }),
      resolveProjectIdByPath: vi.fn().mockResolvedValue('project-session-1'),
      ensureImportedAgentChat: vi.fn(),
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
      mode: 'sync',
      maxEvents: 10,
    });

    expect(result.importedEvents).toBe(2);
    expect(store.ensureImportedAgentChat).not.toHaveBeenCalled();
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'chat-1',
      messages: [
        expect.objectContaining({ text: '새 요청' }),
        expect.objectContaining({ text: '새 답변' }),
      ],
      hasMoreBefore: true,
    }));
  });

  it('imports subagent transcripts into a hidden chat linked to the parent (not the chat list)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-worker-'));
    const projectDir = join(root, '.claude/projects/-home-ubuntu-project-ARIS');
    const parentId = '22222222-2222-2222-2222-222222222222';
    const subagentsDir = join(projectDir, parentId, 'subagents');
    await mkdir(subagentsDir, { recursive: true });
    // Subagent transcript: every record isSidechain, sessionId is the PARENT id.
    await writeFile(join(subagentsDir, 'agent-explore1.jsonl'), [
      '{"type":"user","isSidechain":true,"message":{"role":"user","content":"작업 지시"},"uuid":"su1","timestamp":"2026-07-07T00:00:01.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"22222222-2222-2222-2222-222222222222"}',
      '{"type":"assistant","isSidechain":true,"message":{"role":"assistant","content":[{"type":"text","text":"작업 결과"}]},"uuid":"sa1","timestamp":"2026-07-07T00:00:02.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"22222222-2222-2222-2222-222222222222"}',
    ].join('\n'));
    await writeFile(join(subagentsDir, 'agent-explore1.meta.json'), JSON.stringify({
      agentType: 'Explore', description: '코드베이스 매핑', toolUseId: 'toolu_test123',
    }));
    // Parent transcript has the Task tool_use but NO tool_result => still running.
    // No cwd => skipped as an import candidate, but still read for status.
    await writeFile(join(projectDir, `${parentId}.jsonl`),
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_test123","name":"Task","input":{}}]},"uuid":"p1","timestamp":"2026-07-07T00:00:00.000Z"}');

    const store = {
      discoverImportedAgentSession: vi.fn().mockResolvedValue({ id: 'import-sub', chatId: null }),
      resolveProjectIdByPath: vi.fn().mockResolvedValue('project-session-1'),
      findOwningChat: vi.fn().mockResolvedValue({ chatId: 'parent-chat-1', isImported: true }),
      ensureImportedAgentChat: vi.fn().mockResolvedValue({ chatId: 'subagent-chat-1' }),
      markImportedAgentSessionNative: vi.fn(),
      updateSubagentChatMeta: vi.fn(),
      appendImportedAgentEvents: vi.fn().mockResolvedValue([{ id: 'sev-1' }, { id: 'sev-2' }]),
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
      tailTurns: 3,
    });

    expect(result.discovered).toBe(1);
    expect(store.markImportedAgentSessionNative).not.toHaveBeenCalled();
    expect(store.findOwningChat).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    expect(store.ensureImportedAgentChat).toHaveBeenCalledWith(expect.objectContaining({
      parentChatId: 'parent-chat-1',
      subagentType: 'Explore',
      subagentStatus: 'running',
      title: '코드베이스 매핑',
    }));
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'subagent-chat-1',
    }));
  });

  it('links ARIS-originated transcripts to the native chat instead of creating a duplicate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-worker-'));
    const sessionDir = join(root, '.claude/projects/-home-ubuntu-project-ARIS');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, '33333333-3333-3333-3333-333333333333.jsonl'), [
      '{"type":"user","message":{"role":"user","content":"네이티브 요청"},"uuid":"nu1","timestamp":"2026-07-07T00:00:01.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"33333333-3333-3333-3333-333333333333"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"네이티브 답변"}]},"uuid":"na1","timestamp":"2026-07-07T00:00:02.000Z","cwd":"/home/ubuntu/project/ARIS","sessionId":"33333333-3333-3333-3333-333333333333"}',
    ].join('\n'));
    const store = {
      discoverImportedAgentSession: vi.fn().mockResolvedValue({ id: 'import-native', chatId: null }),
      resolveProjectIdByPath: vi.fn().mockResolvedValue('project-session-1'),
      findOwningChat: vi.fn().mockResolvedValue({ chatId: 'native-chat-1', isImported: false }),
      ensureImportedAgentChat: vi.fn(),
      markImportedAgentSessionNative: vi.fn(),
      updateSubagentChatMeta: vi.fn(),
      appendImportedAgentEvents: vi.fn(),
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
      tailTurns: 3,
    });

    expect(store.markImportedAgentSessionNative).toHaveBeenCalledWith({
      importId: 'import-native',
      arisProjectId: 'project-session-1',
      chatId: 'native-chat-1',
    });
    expect(store.ensureImportedAgentChat).not.toHaveBeenCalled();
    expect(store.appendImportedAgentEvents).not.toHaveBeenCalled();
    expect(result.importedEvents).toBe(0);
  });

  it('runs bounded backfill batches for imported chats with older transcript', async () => {
    const store = {
      discoverImportedAgentSession: vi.fn(),
      resolveProjectIdByPath: vi.fn(),
      ensureImportedAgentChat: vi.fn(),
      appendImportedAgentEvents: vi.fn(),
      listImportedAgentSessionsForBackfill: vi.fn().mockResolvedValue([
        { id: 'import-1', chatId: 'chat-1', hasMoreBefore: true },
      ]),
      loadOlderImportedAgentEvents: vi.fn()
        .mockResolvedValueOnce({ events: [{ id: 'older-1' }, { id: 'older-2' }], hasMoreBefore: true })
        .mockResolvedValueOnce({ events: [{ id: 'older-3' }], hasMoreBefore: false }),
    };

    const result = await runAgentSessionImportOnce({
      store,
      projectPath: '/home/ubuntu/project/ARIS',
      userId: 'user-1',
      codexHome: join(await mkdtemp(join(tmpdir(), 'aris-import-worker-')), '.codex'),
      claudeHome: join(await mkdtemp(join(tmpdir(), 'aris-import-worker-')), '.claude'),
      lookbackDays: 7,
      maxFiles: 10,
      maxBytes: 200_000,
      tailTurns: 1,
      mode: 'backfill',
      maxEvents: 10,
      backfillSessionLimit: 2,
      backfillTurnsPerBatch: 1,
    });

    expect(result.backfilledEvents).toBe(3);
    expect(store.listImportedAgentSessionsForBackfill).toHaveBeenCalledWith({
      projectPath: '/home/ubuntu/project/ARIS',
      limit: 2,
    });
    expect(store.loadOlderImportedAgentEvents).toHaveBeenCalledTimes(2);
  });
});
