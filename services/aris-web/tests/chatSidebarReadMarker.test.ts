import { describe, expect, it } from 'vitest';
import { resolveChatReadMarkerId } from '@/app/sessions/[sessionId]/chatSidebar';

describe('resolveChatReadMarkerId', () => {
  it('uses the latest event id when available', () => {
    expect(
      resolveChatReadMarkerId({
        latestEventId: 'evt-2',
        fallbackLatestEventId: 'evt-1',
      }),
    ).toBe('evt-2');
  });

  it('falls back to the cached latest event id when needed', () => {
    expect(
      resolveChatReadMarkerId({
        latestEventId: null,
        fallbackLatestEventId: 'evt-1',
      }),
    ).toBe('evt-1');
  });
});
