import { describe, expect, it } from 'vitest';
import { createGeminiRuntime } from '../src/runtime/providers/gemini/geminiRuntime.js';
import type { GeminiRuntimeSession, GeminiTurnResult } from '../src/runtime/providers/gemini/types.js';

const makeSession = (id = 'sess-1'): GeminiRuntimeSession => ({
  id,
  metadata: { flavor: 'gemini', path: '/tmp', approvalPolicy: 'on-request' },
  state: { status: 'idle' },
  updatedAt: new Date().toISOString(),
  riskScore: 0,
});

const makeResult = (): GeminiTurnResult => ({
  output: '',
  cwd: '/tmp',
  streamedActionsPersisted: false,
  inferredActions: [],
  threadId: undefined,
  threadIdSource: undefined,
});

describe('createGeminiRuntime — serialization', () => {
  it('serializes concurrent sendTurn calls for the same session scope', async () => {
    const order: number[] = [];
    let resolveFirst!: () => void;
    const firstStarted = new Promise<void>((res) => {
      resolveFirst = res;
    });

    let call = 0;
    const runtime = createGeminiRuntime({
      executeTurn: async () => {
        call++;
        if (call === 1) {
          resolveFirst();
          await new Promise((res) => setTimeout(res, 30));
          order.push(1);
        } else {
          order.push(2);
        }
        return makeResult();
      },
    });

    const session = makeSession();

    const t1 = runtime.sendTurn({ session, prompt: 'first' });
    await firstStarted;
    const t2 = runtime.sendTurn({ session, prompt: 'second' });

    await Promise.all([t1, t2]);
    expect(order).toEqual([1, 2]);
  });

  it('allows different session scopes to run concurrently', async () => {
    const started: string[] = [];

    const runtime = createGeminiRuntime({
      executeTurn: async (req) => {
        started.push(req.session.id);
        await new Promise((res) => setTimeout(res, 20));
        return makeResult();
      },
    });

    const t1 = runtime.sendTurn({ session: makeSession('sess-a'), prompt: 'a' });
    const t2 = runtime.sendTurn({ session: makeSession('sess-b'), prompt: 'b' });

    await t2;
    expect(started).toContain('sess-b');
    await t1;
  });

  it('isRunning returns true while turn is executing', async () => {
    let resolveExec!: () => void;

    const runtime = createGeminiRuntime({
      executeTurn: async () => {
        await new Promise<void>((res) => {
          resolveExec = res;
        });
        return makeResult();
      },
    });

    const session = makeSession();
    const turn = runtime.sendTurn({ session, prompt: 'hi' });

    await new Promise((res) => setTimeout(res, 5));
    expect(runtime.isRunning({ sessionId: session.id, chatId: undefined })).toBe(true);

    resolveExec();
    await turn;
    expect(runtime.isRunning({ sessionId: session.id, chatId: undefined })).toBe(false);
  });
});
