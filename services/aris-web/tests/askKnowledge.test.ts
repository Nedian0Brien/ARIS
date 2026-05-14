import { describe, expect, it } from 'vitest';
import {
  buildAskAnswerDraft,
  extractKnowledgeAssetsFromEvents,
  redactSensitiveText,
} from '@/lib/ask/knowledge';

describe('Ask ARIS knowledge extraction', () => {
  it('redacts tokens, secrets, and env-style credentials before assetization', () => {
    const input = [
      'OPENAI_API_KEY=sk-live-1234567890',
      'RUNTIME_API_TOKEN="runtime-secret-value"',
      'password: hunter2',
      'deploy command is safe to remember',
    ].join('\n');

    const redacted = redactSensitiveText(input);

    expect(redacted).not.toContain('sk-live-1234567890');
    expect(redacted).not.toContain('runtime-secret-value');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(redacted).toContain('RUNTIME_API_TOKEN=[REDACTED]');
    expect(redacted).toContain('password: [REDACTED]');
    expect(redacted).toContain('deploy command is safe to remember');
  });

  it('extracts typed candidate assets with source refs from chat events', () => {
    const assets = extractKnowledgeAssetsFromEvents({
      userId: 'user-1',
      projectId: 'proj-1',
      chatId: 'chat-1',
      events: [
        {
          id: 'evt-decision',
          sessionId: 'proj-1',
          chatId: 'chat-1',
          runId: 'run-1',
          type: 'message',
          title: 'User Instruction',
          text: 'Ask ARIS는 v1에서 직접 배포하지 않고 Project chat으로 유도하기로 결정했다.',
          meta: { role: 'user' },
          seq: 1,
          createdAt: new Date('2026-05-14T01:00:00.000Z'),
        },
        {
          id: 'evt-command',
          sessionId: 'proj-1',
          chatId: 'chat-1',
          runId: 'run-1',
          type: 'command_execution',
          title: 'Verification',
          text: '검증 명령어: DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh',
          meta: { role: 'agent' },
          seq: 2,
          createdAt: new Date('2026-05-14T01:01:00.000Z'),
        },
        {
          id: 'evt-debug',
          sessionId: 'proj-1',
          chatId: 'chat-1',
          runId: 'run-1',
          type: 'text_reply',
          title: 'Root cause',
          text: '원인: runtime 구독이 빠져 실행 중 표시가 stale 상태였다. 해결: useSessionRuntime로 상태를 연결했다.',
          meta: { role: 'agent' },
          seq: 3,
          createdAt: new Date('2026-05-14T01:02:00.000Z'),
        },
      ],
    });

    expect(assets.map((asset) => asset.kind)).toEqual(['decision', 'command_recipe', 'debug_case']);
    expect(assets.every((asset) => asset.status === 'candidate')).toBe(true);
    expect(assets.every((asset) => asset.sourceRefs.some((ref) => ref.sourceType === 'session_chat_event'))).toBe(true);
    expect(assets[0]).toMatchObject({
      userId: 'user-1',
      scope: 'chat',
      projectId: 'proj-1',
      chatId: 'chat-1',
      runId: 'run-1',
    });
  });

  it('routes implementation and deploy requests to Project chat instead of executing from Ask ARIS', () => {
    const draft = buildAskAnswerDraft({
      query: '이 기능 구현하고 배포까지 진행해줘',
      memories: [],
      externalResults: [],
      projectCandidates: [
        { projectId: 'proj-aris', projectName: 'ARIS', lastActivityAt: '2026-05-14T00:00:00.000Z' },
      ],
    });

    expect(draft.intent).toBe('project_handoff');
    expect(draft.sections.arisMemory).toContain('Project chat');
    expect(draft.suggestedProjects).toEqual([
      { projectId: 'proj-aris', projectName: 'ARIS', lastActivityAt: '2026-05-14T00:00:00.000Z' },
    ]);
    expect(draft.sections.inference).toContain('Ask ARIS는 코드 수정, 커밋, 배포를 직접 실행하지 않습니다.');
  });
});
