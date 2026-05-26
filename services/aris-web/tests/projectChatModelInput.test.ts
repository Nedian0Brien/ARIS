import { describe, expect, it } from 'vitest';
import { normalizeProjectChatModelInput } from '@/lib/happy/modelPolicyClient';

describe('normalizeProjectChatModelInput', () => {
  it('drops runtime metadata values so new chats can use the provider default', () => {
    expect(normalizeProjectChatModelInput('chat-stream')).toBeUndefined();
  });

  it('keeps valid model IDs and canonicalizes the legacy codex alias', () => {
    expect(normalizeProjectChatModelInput(' gpt-5.4 ')).toBe('gpt-5.4');
    expect(normalizeProjectChatModelInput('gpt-5-codex')).toBe('gpt-5.3-codex');
  });
});
