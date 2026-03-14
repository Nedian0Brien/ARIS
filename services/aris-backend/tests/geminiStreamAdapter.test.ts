import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GeminiStreamAdapter, parseGeminiStreamToCanonicalEvents } from '../src/runtime/providers/gemini/geminiStreamAdapter.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/gemini/${name}`, import.meta.url), 'utf8');
}

describe('geminiStreamAdapter', () => {
  it('normalizes mixed Gemini delta variants into canonical text and tool events', () => {
    const events = parseGeminiStreamToCanonicalEvents(readFixture('mixed-delta-commentary-tool-final.jsonl'));

    expect(events.map((event) => event.type)).toEqual([
      'turn_started',
      'text_delta',
      'text_delta',
      'text_delta',
      'text_completed',
      'tool_started',
      'tool_completed',
      'text_completed',
      'turn_completed',
    ]);
    expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(3);
    expect(events.find((event) => event.type === 'tool_completed')).toMatchObject({
      type: 'tool_completed',
      threadId: 'gemini-mixed-thread',
      turnId: 'turn-1',
      callId: 'call-1',
    });
  });

  it('keeps the last completed Gemini message as output even when a later partial is aborted', () => {
    const adapter = new GeminiStreamAdapter();
    for (const line of readFixture('commentary-completed-then-abort.jsonl').trim().split('\n')) {
      adapter.processLine(line);
    }

    const summary = adapter.summarize();

    expect(summary.output).toBe('먼저 상황을 확인하겠습니다.');
    expect(summary.events.at(-1)).toMatchObject({
      type: 'turn_aborted',
      threadId: 'gemini-abort-thread',
      turnId: 'turn-abort',
    });
  });

  it('synthesizes completed Gemini commentary blocks from delta-only message streams', () => {
    const events = parseGeminiStreamToCanonicalEvents(readFixture('delta-only-message-tool-boundaries.jsonl'));

    expect(events.map((event) => event.type)).toEqual([
      'turn_started',
      'text_delta',
      'text_completed',
      'tool_started',
      'tool_completed',
      'text_delta',
      'text_delta',
      'text_completed',
      'tool_started',
      'tool_completed',
      'text_delta',
      'text_delta',
      'text_completed',
      'turn_completed',
    ]);

    const completedTexts = events
      .filter((event) => event.type === 'text_completed')
      .map((event) => event.text);
    expect(completedTexts).toEqual([
      '`AGENTS.md` 파일을 읽어 프로젝트 운영 규칙과 협업 가이드라인을 확인하겠습니다.',
      '`services/aris-web/app/SessionDashboard.tsx` 파일을 읽어 대시보드 컴포넌트의 구현 내용을 확인하겠습니다.',
      '`AGENTS.md`와 `services/aris-web/app/SessionDashboard.tsx` 파일을 모두 읽었습니다.\n\n### 작업 요약\n\n1.  **`AGENTS.md` 확인**: 프로젝트의 운영 규칙과 협업 가이드라인을 확인했습니다.',
    ]);

    const toolEvents = events.filter((event) => event.type === 'tool_completed');
    expect(toolEvents).toMatchObject([
      {
        type: 'tool_completed',
        action: {
          actionType: 'file_read',
          path: 'AGENTS.md',
        },
      },
      {
        type: 'tool_completed',
        action: {
          actionType: 'file_read',
          path: 'services/aris-web/app/SessionDashboard.tsx',
        },
      },
    ]);
  });
});
