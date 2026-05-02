import { describe, expect, it } from 'vitest';
import { selectRecentChats, selectRecentProjects } from '@/app/homeProjects';
import type { SessionChat, SessionSummary } from '@/lib/happy/types';

function session(id: string, lastActivityAt: string | null, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    agent: 'codex',
    status: 'idle',
    lastActivityAt,
    riskScore: 0,
    projectName: id,
    totalChats: 0,
    ...overrides,
  };
}

function chat(id: string, sessionId: string, lastActivityAt: string, overrides: Partial<SessionChat> = {}): SessionChat {
  return {
    id,
    sessionId,
    agent: 'codex',
    title: `Chat ${id}`,
    isPinned: false,
    isDefault: false,
    threadId: null,
    latestPreview: `real preview ${id}`,
    latestEventAt: lastActivityAt,
    latestEventIsUser: false,
    latestHasErrorSignal: false,
    lastActivityAt,
    createdAt: lastActivityAt,
    updatedAt: lastActivityAt,
    ...overrides,
  };
}

describe('home recent projects', () => {
  it('selects at most six projects by latest activity', () => {
    const sessions = [
      session('old-pinned-running', '2026-04-20T09:00:00.000Z', { isPinned: true, status: 'running' }),
      session('latest-2', '2026-04-25T09:00:00.000Z'),
      session('latest-6', '2026-04-25T05:00:00.000Z'),
      session('latest-1', '2026-04-25T10:00:00.000Z'),
      session('latest-4', '2026-04-25T07:00:00.000Z'),
      session('latest-3', '2026-04-25T08:00:00.000Z'),
      session('latest-5', '2026-04-25T06:00:00.000Z'),
      session('no-activity', null),
    ];

    expect(selectRecentProjects(sessions).map((item) => item.id)).toEqual([
      'latest-1',
      'latest-2',
      'latest-3',
      'latest-4',
      'latest-5',
      'latest-6',
    ]);
  });

  it('orders recent projects by the latest real chat activity when present', () => {
    const sessions = [
      session('session-activity-old-chat-new', '2026-04-20T09:00:00.000Z', {
        recentChats: [
          chat('new-chat', 'session-activity-old-chat-new', '2026-04-26T09:00:00.000Z'),
        ],
      }),
      session('session-activity-new-chat-old', '2026-04-25T09:00:00.000Z', {
        recentChats: [
          chat('old-chat', 'session-activity-new-chat-old', '2026-04-21T09:00:00.000Z'),
        ],
      }),
    ];

    expect(selectRecentProjects(sessions).map((item) => item.id)).toEqual([
      'session-activity-old-chat-new',
      'session-activity-new-chat-old',
    ]);
  });

  it('selects latest real chats across projects with session context', () => {
    const sessions = [
      session('aris', '2026-04-20T09:00:00.000Z', {
        alias: 'ARIS',
        projectName: '/home/ubuntu/project/ARIS',
        recentChats: [
          chat('aris-new', 'aris', '2026-04-26T09:00:00.000Z', {
            agent: 'claude',
            latestPreview: '실제 ARIS 채팅 미리보기',
          }),
          chat('aris-old', 'aris', '2026-04-22T09:00:00.000Z'),
        ],
      }),
      session('lawdigest', '2026-04-25T09:00:00.000Z', {
        projectName: '/home/ubuntu/project/Lawdigest',
        recentChats: [
          chat('lawdigest-chat', 'lawdigest', '2026-04-27T09:00:00.000Z', {
            latestPreview: '실제 Lawdigest 채팅 미리보기',
          }),
        ],
      }),
    ];

    expect(selectRecentChats(sessions, 2)).toEqual([
      expect.objectContaining({
        id: 'lawdigest-chat',
        sessionId: 'lawdigest',
        sessionName: 'Lawdigest',
        latestPreview: '실제 Lawdigest 채팅 미리보기',
      }),
      expect.objectContaining({
        id: 'aris-new',
        sessionId: 'aris',
        sessionName: 'ARIS',
        agent: 'claude',
        latestPreview: '실제 ARIS 채팅 미리보기',
      }),
    ]);
  });
});
