import { describe, expect, it } from 'vitest';
import { sanitizeAgentMessageText, shouldDisplayToolStatus } from '../src/runtime/agentMessageSanitizer.js';

describe('agentMessageSanitizer', () => {
  it('strips repeated plan status metadata from assistant text', () => {
    const text = `Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가
status: in_progress

registry/controller를 ClaudeSession 중심으로 재편
status: pending

단위 테스트 보강
status: pending`;

    expect(sanitizeAgentMessageText(text)).toBe(`Sprint 2 구현 계획은 이렇습니다.

ClaudeSession 객체 추가

registry/controller를 ClaudeSession 중심으로 재편

단위 테스트 보강`);
  });

  it('keeps status lines inside fenced code blocks', () => {
    const text = `다음 예시는 유지해야 합니다.

\`\`\`yaml
status: pending
status: completed
\`\`\``;

    expect(sanitizeAgentMessageText(text)).toBe(text);
  });

  it('hides non-terminal tool statuses but keeps failure signals', () => {
    expect(shouldDisplayToolStatus('pending')).toBe(false);
    expect(shouldDisplayToolStatus('in_progress')).toBe(false);
    expect(shouldDisplayToolStatus('waiting_for_approval')).toBe(false);
    expect(shouldDisplayToolStatus('failed')).toBe(true);
  });
});
