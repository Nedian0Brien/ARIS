import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  appendSessionMessage: vi.fn(),
  getUserModelSettings: vi.fn(),
  resolveRuntimeMessageModel: vi.fn(),
  normalizeSupportedAgent: vi.fn(),
  prismaFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  appendSessionMessage: mocks.appendSessionMessage,
  getSessionEvents: vi.fn(),
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
    sessionChat: {
      findFirst: mocks.prismaFindFirst,
    },
  },
}));

import { POST } from '@/app/api/runtime/sessions/[sessionId]/events/route';

describe('session events route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.prismaFindFirst.mockResolvedValue({ agent: 'codex', model: 'gpt-5.4', geminiMode: null });
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
    mocks.appendSessionMessage.mockResolvedValue({
      id: 'evt-1',
      timestamp: '2026-04-11T09:00:00.000Z',
      kind: 'text_reply',
      title: 'User Instruction',
      body: '이미지 확인',
      meta: { role: 'user' },
    });
  });

  it('preserves image attachments on user messages while normalizing model metadata', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/events', {
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
                previewUrl: '/api/fs/raw?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-1-screen.png',
              },
            ],
          },
        }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.appendSessionMessage).toHaveBeenCalledWith(expect.objectContaining({
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
});
