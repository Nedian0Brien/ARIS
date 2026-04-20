import type { UiEvent } from '@/lib/happy/types';
import { readChatImageAttachments, stripImageAttachmentPromptPrefix } from '@/lib/chatImageAttachments';
import { isUserEvent, truncateSingleLine } from '../helpers';

export type LastUserMessageJumpTarget = {
  eventId: string;
  preview: string;
  timestamp: string;
};

type ResolveLastPassedUserMessageJumpTargetInput = {
  targets: LastUserMessageJumpTarget[];
  bubbleBottomByEventId: Map<string, number> | Record<string, number>;
  scrollBoundary: number;
};

type ShouldShowLastUserMessageJumpBarInput = {
  targetEventId: string | null;
  isWorkspaceHome: boolean;
  isNewChatPlaceholder: boolean;
  showChatTransitionLoading: boolean;
  showScrollToBottom: boolean;
};

export function resolveUserMessageJumpTargets(events: UiEvent[]): LastUserMessageJumpTarget[] {
  return events.flatMap((event) => {
    if (!isUserEvent(event)) {
      return [];
    }

    return [{
      eventId: event.id,
      preview: resolveLastUserMessagePreview(event),
      timestamp: event.timestamp,
    }];
  });
}

export function resolveLastPassedUserMessageJumpTarget(
  input: ResolveLastPassedUserMessageJumpTargetInput,
): LastUserMessageJumpTarget | null {
  const { bubbleBottomByEventId, scrollBoundary, targets } = input;

  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    const bubbleBottom = bubbleBottomByEventId instanceof Map
      ? bubbleBottomByEventId.get(target.eventId)
      : bubbleBottomByEventId[target.eventId];

    if (typeof bubbleBottom !== 'number') {
      continue;
    }
    if (bubbleBottom <= scrollBoundary) {
      return target;
    }
  }

  return null;
}

export function shouldShowLastUserMessageJumpBar(input: ShouldShowLastUserMessageJumpBarInput): boolean {
  if (!input.targetEventId) {
    return false;
  }
  if (
    input.isWorkspaceHome
    || input.isNewChatPlaceholder
    || input.showChatTransitionLoading
    || !input.showScrollToBottom
  ) {
    return false;
  }
  return true;
}

function resolveLastUserMessagePreview(event: UiEvent): string {
  const stripped = stripImageAttachmentPromptPrefix((event.body || event.title || '').replace(/\r\n/g, '\n')).trim();
  const firstLine = stripped.split('\n').map((line) => line.trim()).find(Boolean);

  if (firstLine) {
    return truncateSingleLine(firstLine, 88);
  }

  if (readChatImageAttachments(event.meta).length > 0) {
    return '이미지 첨부';
  }

  const title = (event.title || '').trim();
  if (title) {
    return truncateSingleLine(title, 88);
  }

  return '사용자 메시지';
}
