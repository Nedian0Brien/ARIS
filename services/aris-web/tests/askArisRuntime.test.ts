import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildAskArisChatTitle,
  buildAskArisEventPayload,
  buildAskArisSessionPayload,
  normalizeAskArisPrompt,
} from '@/components/ask/askArisRuntime';

const __dirname = dirname(fileURLToPath(import.meta.url));
const askSurface = readFileSync(resolve(__dirname, '../components/ask/AskArisSurface.tsx'), 'utf8');

describe('Ask ARIS runtime helpers', () => {
  it('normalizes prompt text before creating runtime objects', () => {
    expect(normalizeAskArisPrompt('  지난 결정\n\n요약해줘  ')).toBe('지난 결정\n\n요약해줘');
    expect(normalizeAskArisPrompt('   ')).toBe('');
  });

  it('builds a reusable runtime session payload for the Ask entry point', () => {
    expect(buildAskArisSessionPayload('/home/ubuntu/project/ARIS')).toEqual({
      path: '/home/ubuntu/project/ARIS',
      agent: 'codex',
      approvalPolicy: 'on-request',
    });
  });

  it('uses the first prompt as the real chat title without letting it grow forever', () => {
    expect(buildAskArisChatTitle('React 19 변경점 알려줘')).toBe('React 19 변경점 알려줘');
    expect(buildAskArisChatTitle('a'.repeat(90))).toBe(`${'a'.repeat(61)}...`);
    expect(buildAskArisChatTitle('')).toBe('Ask ARIS');
  });

  it('builds the first prompt payload with chat, agent, and model metadata', () => {
    expect(buildAskArisEventPayload({
      chatId: 'chat-1',
      prompt: '왜 이렇게 결정했지?',
      model: 'gpt-5.4',
      modelReasoningEffort: 'high',
    })).toEqual({
      type: 'message',
      title: 'User Instruction',
      text: '왜 이렇게 결정했지?',
      meta: {
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
      },
    });
  });

  it('wires the Ask form to real runtime session, chat, and prompt APIs', () => {
    expect(askSurface).toContain("fetch(withAppBasePath('/api/runtime/sessions')");
    expect(askSurface).toContain('fetch(withAppBasePath(buildProjectChatCollectionPath(projectId))');
    expect(askSurface).toContain('fetch(withAppBasePath(buildProjectRuntimeEventsPath(projectId))');
    expect(askSurface).toContain('await submitAskPrompt(session.id, chat.id, prompt);');
    expect(askSurface).toContain('onProjectChatOpen(session.id, chat.id);');
    expect(askSurface).not.toContain('event.preventDefault();\n            }}');
  });
});
