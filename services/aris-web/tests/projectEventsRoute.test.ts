import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  appendProjectMessage: vi.fn(),
  submitUserPrompt: vi.fn(),
  getProjectEvents: vi.fn(),
  getImportedAgentProjectState: vi.fn(),
  importOlderAgentTranscript: vi.fn(),
  importLatestAgentTranscript: vi.fn(),
  getUserModelSettings: vi.fn(),
  resolveRuntimeMessageModel: vi.fn(),
  normalizeSupportedAgent: vi.fn(),
  prismaFindFirst: vi.fn(),
  prismaUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  appendProjectMessage: mocks.appendProjectMessage,
  submitUserPrompt: mocks.submitUserPrompt,
  getProjectEvents: mocks.getProjectEvents,
  getImportedAgentProjectState: mocks.getImportedAgentProjectState,
  importOlderAgentTranscript: mocks.importOlderAgentTranscript,
  importLatestAgentTranscript: mocks.importLatestAgentTranscript,
  HappyHttpError: class HappyHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/settings/providerPreferences', () => ({
  getUserModelSettings: mocks.getUserModelSettings,
}));

vi.mock('@/lib/happy/modelPolicy', () => ({
  normalizeSupportedAgent: mocks.normalizeSupportedAgent,
  resolveRuntimeMessageModel: mocks.resolveRuntimeMessageModel,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    chat: {
      findFirst: mocks.prismaFindFirst,
      update: mocks.prismaUpdate,
    },
  },
}));

import { GET, POST } from '@/app/api/runtime/projects/[projectId]/events/route';

describe('session events route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.prismaFindFirst.mockResolvedValue({ agent: 'codex', model: 'gpt-5.4', geminiMode: null });
    mocks.prismaUpdate.mockResolvedValue({ id: 'chat-1', agent: 'codex' });
    mocks.normalizeSupportedAgent.mockImplementation((agent: unknown, fallback: unknown) => agent ?? fallback);
    mocks.getUserModelSettings.mockResolvedValue({
      providers: {
        codex: { selectedModelIds: ['gpt-5.4'] },
        claude: { selectedModelIds: [] },
        gemini: { selectedModelIds: [] },
      },
      legacyCustomModels: {
        codex: null,
        claude: null,
        gemini: null,
      },
    });
    mocks.resolveRuntimeMessageModel.mockReturnValue({
      agent: 'codex',
      model: 'gpt-5.4',
      source: 'requested',
      requestedModel: 'gpt-5.4',
      fallbackReason: null,
      customModel: null,
    });
    mocks.submitUserPrompt.mockResolvedValue({
      id: 'evt-user-1',
      timestamp: '2026-04-11T09:00:00.000Z',
      kind: 'text_reply',
      title: 'User Instruction',
      body: '이미지 확인',
      meta: { role: 'user' },
    });
    mocks.appendProjectMessage.mockResolvedValue({
      id: 'evt-notice-1',
      timestamp: '2026-04-11T09:00:00.000Z',
      kind: 'text_reply',
      title: '에이전트 변경',
      body: '이 채팅의 에이전트가 codex → claude로 변경되었습니다.',
      meta: { role: 'agent', streamEvent: 'agent_switched' },
    });
    mocks.getProjectEvents.mockResolvedValue({
      events: [],
      page: {
        hasMoreBefore: false,
        hasMoreAfter: false,
        oldestEventId: null,
        newestEventId: null,
        returnedCount: 0,
        totalCount: 0,
      },
    });
    mocks.getImportedAgentProjectState.mockResolvedValue(null);
    mocks.importOlderAgentTranscript.mockResolvedValue({ events: [], hasMoreBefore: false });
    mocks.importLatestAgentTranscript.mockResolvedValue({ events: [], hasMoreBefore: false });
  });

  it('marks imported chats as having older history on the initial events page', async () => {
    mocks.getImportedAgentProjectState.mockResolvedValueOnce({ hasMoreBefore: true });

    const response = await GET(
      new NextRequest('http://localhost/api/runtime/projects/session-1/events?chatId=chat-1'),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).page.hasMoreBefore).toBe(true);
    expect(mocks.importLatestAgentTranscript).toHaveBeenCalledWith('chat-1');
    expect(mocks.importOlderAgentTranscript).not.toHaveBeenCalled();
  });

  it('imports older transcript before recalculating a before page for imported chats', async () => {
    mocks.getImportedAgentProjectState.mockResolvedValueOnce({ hasMoreBefore: true });
    mocks.importOlderAgentTranscript.mockResolvedValueOnce({ events: [{ id: 'older-1' }], hasMoreBefore: false });

    const response = await GET(
      new NextRequest('http://localhost/api/runtime/projects/session-1/events?chatId=chat-1&before=event-2'),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.importOlderAgentTranscript).toHaveBeenCalledWith('chat-1', { limitTurns: 3 });
    expect(mocks.getProjectEvents).toHaveBeenCalledWith('session-1', expect.objectContaining({
      before: 'event-2',
      chatId: 'chat-1',
    }));
  });

  it('preserves image attachments on user messages while normalizing model metadata', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/projects/session-1/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: '이미지 확인',
          meta: {
            role: 'user',
            chatId: 'chat-1',
            agent: 'codex',
            model: 'gpt-5.4',
            attachments: [
              {
                assetId: 'asset-1',
                kind: 'image',
                name: 'screen.png',
                mimeType: 'image/png',
                size: 1200,
                serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-1-screen.png',
                previewUrl: '/api/runtime/projects/session-1/assets/images?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-1-screen.png',
              },
            ],
          },
        }),
      }),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.submitUserPrompt).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        attachments: [
          expect.objectContaining({
            assetId: 'asset-1',
            kind: 'image',
            name: 'screen.png',
          }),
        ],
        modelValidation: expect.objectContaining({
          source: 'requested',
        }),
      }),
    }));
  });

  it('passes manually added Codex models into runtime normalization', async () => {
    mocks.getUserModelSettings.mockResolvedValueOnce({
      providers: {
        codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.5'] },
        claude: { selectedModelIds: [] },
        gemini: { selectedModelIds: [] },
      },
      legacyCustomModels: {
        codex: null,
        claude: null,
        gemini: null,
      },
    });

    await POST(
      new NextRequest('http://localhost/api/runtime/projects/session-1/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: 'gpt-5.5로 실행',
          meta: {
            role: 'user',
            chatId: 'chat-1',
            agent: 'codex',
            model: 'gpt-5.5',
          },
        }),
      }),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(mocks.resolveRuntimeMessageModel).toHaveBeenCalledWith(expect.objectContaining({
      agent: 'codex',
      requestedModel: 'gpt-5.5',
      customModels: ['gpt-5.4', 'gpt-5.5'],
    }));
  });

  describe('chat agent synchronization', () => {
    it('updates Chat.agent and emits agent-switch notice when user message changes the active agent', async () => {
      mocks.prismaFindFirst.mockResolvedValueOnce({
        agent: 'codex',
        model: 'gpt-5.4',
        geminiMode: null,
      });
      mocks.resolveRuntimeMessageModel.mockReturnValueOnce({
        agent: 'claude',
        model: 'claude-opus-4-7',
        source: 'requested',
        requestedModel: 'claude-opus-4-7',
        fallbackReason: null,
        customModel: null,
      });

      const response = await POST(
        new NextRequest('http://localhost/api/runtime/projects/session-1/events', {
          method: 'POST',
          body: JSON.stringify({
            type: 'message',
            title: 'User Instruction',
            text: 'switch to claude',
            meta: {
              role: 'user',
              chatId: 'chat-1',
              agent: 'claude',
              model: 'claude-opus-4-7',
            },
          }),
        }),
        { params: Promise.resolve({ projectId: 'session-1' }) },
      );

      expect(response.status).toBe(200);

      expect(mocks.prismaUpdate).toHaveBeenCalledWith({
        where: { id: 'chat-1' },
        data: expect.objectContaining({ agent: 'claude', model: 'claude-opus-4-7' }),
      });

      expect(mocks.appendProjectMessage).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'session-1',
        type: 'message',
        title: '에이전트 변경',
        meta: expect.objectContaining({
          chatId: 'chat-1',
          role: 'agent',
          streamEvent: 'agent_switched',
          fromAgent: 'codex',
          toAgent: 'claude',
        }),
      }));

      // user prompt is still submitted exactly once
      expect(mocks.submitUserPrompt).toHaveBeenCalledTimes(1);
    });

    it('does not update Chat or emit a notice when the user message keeps the same agent', async () => {
      mocks.prismaFindFirst.mockResolvedValueOnce({
        agent: 'codex',
        model: 'gpt-5.4',
        geminiMode: null,
      });

      const response = await POST(
        new NextRequest('http://localhost/api/runtime/projects/session-1/events', {
          method: 'POST',
          body: JSON.stringify({
            type: 'message',
            title: 'User Instruction',
            text: 'same agent',
            meta: {
              role: 'user',
              chatId: 'chat-1',
              agent: 'codex',
              model: 'gpt-5.4',
            },
          }),
        }),
        { params: Promise.resolve({ projectId: 'session-1' }) },
      );

      expect(response.status).toBe(200);
      expect(mocks.prismaUpdate).not.toHaveBeenCalled();
      expect(mocks.appendProjectMessage).not.toHaveBeenCalled();
    });

    it('updates Chat silently (no notice) when previous agent is unknown — treats as fresh chat', async () => {
      mocks.prismaFindFirst.mockResolvedValueOnce({
        agent: 'unknown',
        model: null,
        geminiMode: null,
      });
      mocks.resolveRuntimeMessageModel.mockReturnValueOnce({
        agent: 'claude',
        model: 'claude-opus-4-7',
        source: 'requested',
        requestedModel: 'claude-opus-4-7',
        fallbackReason: null,
        customModel: null,
      });

      const response = await POST(
        new NextRequest('http://localhost/api/runtime/projects/session-1/events', {
          method: 'POST',
          body: JSON.stringify({
            type: 'message',
            title: 'User Instruction',
            text: 'first message',
            meta: {
              role: 'user',
              chatId: 'chat-1',
              agent: 'claude',
              model: 'claude-opus-4-7',
            },
          }),
        }),
        { params: Promise.resolve({ projectId: 'session-1' }) },
      );

      expect(response.status).toBe(200);
      expect(mocks.prismaUpdate).toHaveBeenCalledWith({
        where: { id: 'chat-1' },
        data: expect.objectContaining({ agent: 'claude', model: 'claude-opus-4-7' }),
      });
      expect(mocks.appendProjectMessage).not.toHaveBeenCalled();
    });
  });
});
