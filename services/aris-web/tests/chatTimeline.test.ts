import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageSquarePlus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ChatTimeline } from '@/app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline';
import { PermissionRequestMessage } from '@/app/sessions/[sessionId]/PermissionRequestMessage';
import { AGENT_QUICK_STARTS } from '@/app/sessions/[sessionId]/chat-screen/constants';
import type { AgentMeta, TimelineRenderItem } from '@/app/sessions/[sessionId]/chat-screen/types';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { SessionChat, UiEvent } from '@/lib/happy/types';
import { buildPermissionTimelineItems } from '@/app/sessions/[sessionId]/chatTimeline';

function buildPermission(overrides: Partial<RenderablePermissionRequest> = {}): RenderablePermissionRequest {
  return {
    id: overrides.id ?? 'perm-1',
    sessionId: overrides.sessionId ?? 'session-1',
    ...(overrides.chatId ? { chatId: overrides.chatId } : {}),
    agent: overrides.agent ?? 'gemini',
    command: overrides.command ?? 'Run pwd',
    reason: overrides.reason ?? 'Need shell access',
    risk: overrides.risk ?? 'medium',
    requestedAt: overrides.requestedAt ?? '2026-03-15T00:00:00.000Z',
    state: overrides.state ?? 'approved',
    availability: overrides.availability ?? 'persisted',
  };
}

function buildChat(overrides: Partial<SessionChat> = {}): SessionChat {
  return {
    id: overrides.id ?? 'chat-1',
    sessionId: overrides.sessionId ?? 'session-1',
    agent: overrides.agent ?? 'codex',
    model: overrides.model ?? 'gpt-5.4',
    geminiMode: overrides.geminiMode ?? null,
    modelReasoningEffort: overrides.modelReasoningEffort ?? null,
    title: overrides.title ?? '새 채팅',
    isPinned: overrides.isPinned ?? false,
    isDefault: overrides.isDefault ?? false,
    threadId: overrides.threadId ?? null,
    latestPreview: overrides.latestPreview,
    latestEventId: overrides.latestEventId ?? null,
    latestEventAt: overrides.latestEventAt ?? '2026-03-15T00:00:00.000Z',
    latestEventIsUser: overrides.latestEventIsUser ?? false,
    latestHasErrorSignal: overrides.latestHasErrorSignal ?? false,
    lastReadAt: overrides.lastReadAt,
    lastReadEventId: overrides.lastReadEventId ?? null,
    lastActivityAt: overrides.lastActivityAt ?? '2026-03-15T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-03-15T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-15T00:00:00.000Z',
  };
}

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-15T00:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? '',
    body: overrides.body ?? '',
    meta: overrides.meta,
    action: overrides.action,
    result: overrides.result,
    parsed: overrides.parsed,
    severity: overrides.severity,
  };
}

function collectElements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectElements(child));
  }
  if (!React.isValidElement(node)) {
    return [];
  }
  const element = node as React.ReactElement<any>;
  return [element, ...collectElements((element.props as { children?: React.ReactNode }).children)];
}

function getElementProp<T = unknown>(element: React.ReactElement<any>, key: string): T {
  return (element.props as Record<string, T>)[key];
}

function buildTimelineProps(overrides: Partial<React.ComponentProps<typeof ChatTimeline>> = {}): React.ComponentProps<typeof ChatTimeline> {
  const agentMeta: AgentMeta = {
    label: 'Codex',
    tone: 'blue',
    Icon: MessageSquarePlus,
  };
  const userEvent = buildEvent({
    id: 'user-1',
    body: '사용자 메시지',
    meta: { role: 'user' },
  });
  const agentEvent = buildEvent({
    id: 'agent-1',
    body: '에이전트 응답',
    meta: { role: 'assistant' },
  });
  const timelineItems: TimelineRenderItem[] = [
    { type: 'permission', permission: buildPermission({ id: 'perm-1', availability: 'live', state: 'pending' }), sortKey: 1, order: 1 },
    {
      type: 'stream',
      item: { type: 'action_overflow', id: 'overflow-1', runId: 'run-1', kind: 'run_execution', hiddenCount: 2, expanded: false, timestamp: '2026-03-15T00:00:01.000Z' },
      sortKey: 2,
      order: 2,
    },
    { type: 'stream', item: { type: 'event', event: userEvent }, sortKey: 3, order: 3 },
    {
      type: 'stream',
      item: {
        type: 'event',
        event: buildEvent({
          id: 'action-1',
          kind: 'file_read',
          title: 'Read file',
          body: '',
          action: { path: '/tmp/demo.txt' },
          result: { preview: 'line 1', truncated: false },
          meta: { role: 'assistant' },
        }),
      },
      sortKey: 4,
      order: 4,
    },
    { type: 'stream', item: { type: 'event', event: agentEvent }, sortKey: 5, order: 5 },
  ];

  return {
    activeAgentFlavor: 'codex',
    activeChat: buildChat(),
    agentMeta,
    chatEntryPendingRevealClassName: '',
    copiedUserEventId: null,
    expandedResultIds: {},
    highlightedEventId: null,
    isAgentRunning: true,
    isDebugMode: false,
    isMobileLayout: false,
    isOperator: true,
    loadingPermissionId: null,
    scrollRef: { current: null },
    showChatTransitionLoading: false,
    showScrollToBottom: true,
    timelineItems,
    onCopyUserMessage: vi.fn(),
    onDecidePermission: vi.fn(),
    onDeleteEmptyAutoChat: vi.fn(),
    onJumpToBottom: vi.fn(),
    onSelectQuickStart: vi.fn(),
    onStreamScroll: vi.fn(),
    onToggleActionRun: vi.fn(),
    onToggleResult: vi.fn(),
    ...overrides,
  };
}

describe('buildPermissionTimelineItems', () => {
  it('keeps approved permissions in the timeline without reclassifying them as pending', () => {
    const items = buildPermissionTimelineItems([
      buildPermission({ state: 'approved' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'permission',
      permission: {
        id: 'perm-1',
        state: 'approved',
        availability: 'persisted',
      },
    });
  });
});

describe('ChatTimeline', () => {
  it('renders the empty auto-generated chat state with the existing quick starts', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatTimeline, buildTimelineProps({
        activeChat: buildChat({ title: '새 채팅' }),
        isAgentRunning: false,
        showScrollToBottom: false,
        timelineItems: [],
      })),
    );

    expect(markup).toContain('뒤로');
    expect(markup).toContain(AGENT_QUICK_STARTS.codex?.[0] ?? '');
  });

  it('renders mixed timeline rows and forwards the main callback seams', () => {
    const onCopyUserMessage = vi.fn();
    const onDecidePermission = vi.fn();
    const onJumpToBottom = vi.fn();
    const onToggleActionRun = vi.fn();

    const seamProps = buildTimelineProps({
      onCopyUserMessage,
      onDecidePermission,
      onJumpToBottom,
      onToggleActionRun,
    });
    const tree = ChatTimeline(seamProps);
    const elements = collectElements(tree);
    const markup = renderToStaticMarkup(React.createElement(ChatTimeline, buildTimelineProps({
      timelineItems: seamProps.timelineItems.filter((item) => item.type !== 'permission'),
    })));

    expect(markup).toContain('YOU');
    expect(markup).toContain('에이전트 응답');
    expect(markup).toContain('2개의 행동 더 보기');
    expect(markup).toContain('맨 아래로 이동');

    const permissionMessage = elements.find((element) => element.type === PermissionRequestMessage);
    expect(permissionMessage).toBeDefined();
    getElementProp<(permissionId: string, decision: 'allow_once') => void>(permissionMessage!, 'onDecide')('perm-1', 'allow_once');
    expect(onDecidePermission).toHaveBeenCalledWith('perm-1', 'allow_once');

    const overflowToggle = elements.find((element) => getElementProp<string | undefined>(element, 'aria-label') === '중간 행동 2개 펼치기');
    expect(overflowToggle).toBeDefined();
    getElementProp<() => void>(overflowToggle!, 'onClick')();
    expect(onToggleActionRun).toHaveBeenCalledWith('run-1');

    const copyButton = elements.find((element) => getElementProp<string | undefined>(element, 'aria-label') === '사용자 메시지 복사');
    expect(copyButton).toBeDefined();
    getElementProp<() => void>(copyButton!, 'onClick')();
    expect(onCopyUserMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));

    const scrollButton = elements.find((element) => getElementProp<string | undefined>(element, 'aria-label') === '맨 아래로 이동');
    expect(scrollButton).toBeDefined();
    getElementProp<() => void>(scrollButton!, 'onClick')();
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });
});
