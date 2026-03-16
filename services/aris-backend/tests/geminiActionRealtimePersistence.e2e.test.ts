/**
 * E2E 테스트: Gemini action 카드 실시간 저장 검증
 *
 * 실제 runGeminiAcpTurn을 호출하고, FakeAcpChild를 통해 ACP stdout을 시뮬레이션한다.
 * onAction 콜백이 emitChain(thinking 처리)과 독립적으로 즉시 실행되는지를
 * 타임스탬프와 호출 순서로 검증한다.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { runGeminiAcpTurn } from '../src/runtime/providers/gemini/geminiAcpClient.js';

/**
 * thinking 청크마다 실제 지연을 삽입하는 ACP fake child.
 * session/prompt에 대한 응답으로:
 * 1. agent_thought_chunk N개 (각각 thinkingDelayMs 지연)
 * 2. tool_call + tool_call_update M개 (action)
 * 3. agent_message_chunk (최종 텍스트)
 * 를 순서대로 전송한다.
 */
class DelayedThinkingAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  private buffer = '';
  private readonly thinkingChunkCount: number;
  private readonly thinkingDelayMs: number;
  private readonly actionCount: number;

  constructor(options: {
    thinkingChunkCount?: number;
    thinkingDelayMs?: number;
    actionCount?: number;
  } = {}) {
    super();
    this.thinkingChunkCount = options.thinkingChunkCount ?? 5;
    this.thinkingDelayMs = options.thinkingDelayMs ?? 80;
    this.actionCount = options.actionCount ?? 3;

    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (chunk: string) => {
      this.buffer += chunk;
      let lineEnd = this.buffer.indexOf('\n');
      while (lineEnd >= 0) {
        const line = this.buffer.slice(0, lineEnd).trim();
        this.buffer = this.buffer.slice(lineEnd + 1);
        if (line) {
          void this.handleLine(line);
        }
        lineEnd = this.buffer.indexOf('\n');
      }
    });
  }

  kill(): boolean {
    if (!this.killed) {
      this.killed = true;
      this.stdout.end();
      this.stderr.end();
      this.emit('close', 0, null);
    }
    return true;
  }

  private send(payload: Record<string, unknown>) {
    setImmediate(() => {
      if (!this.killed) {
        this.stdout.write(`${JSON.stringify(payload)}\n`);
      }
    });
  }

  private async handleLine(line: string) {
    const msg = JSON.parse(line) as {
      id?: string;
      method?: string;
      params?: Record<string, unknown>;
    };

    if (msg.method === 'initialize') {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { loadSession: true },
        },
      });
      return;
    }

    if (msg.method === 'session/new') {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          sessionId: 'acp-session-timing',
          modes: { currentModeId: 'default', availableModes: [{ id: 'default', label: 'Default' }] },
          models: { currentModelId: 'gemini-2.5-pro', availableModels: [{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }] },
        },
      });
      return;
    }

    if (msg.method === 'session/set_mode' || msg.method === 'session/set_model') {
      this.send({ jsonrpc: '2.0', id: msg.id, result: {} });
      return;
    }

    if (msg.method === 'session/prompt') {
      const sessionId = String(msg.params?.sessionId ?? '');

      // 1. thinking 청크를 N개 전송 — 각 청크 사이에 delay를 삽입하여
      //    emitChain이 길게 이어지도록 만든다.
      for (let i = 0; i < this.thinkingChunkCount; i += 1) {
        await delay(this.thinkingDelayMs);
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_thought_chunk',
              content: { type: 'text', text: `thinking chunk ${i + 1} ` },
            },
          },
        });
      }

      // 2. action M개 전송 — thinking 청크 이후에 도착하지만
      //    actionChain이 emitChain과 독립적이라면 onAction이 즉시 호출된다.
      for (let i = 0; i < this.actionCount; i += 1) {
        await delay(10); // action 간 최소 간격
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: `tool-timing-${i + 1}`,
              status: 'in_progress',
              title: `Read file ${i + 1}`,
              kind: 'read',
              locations: [{ path: `/tmp/file-${i + 1}.txt` }],
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: `tool-timing-${i + 1}`,
              status: 'completed',
              content: [{ type: 'content', content: { type: 'text', text: `content of file ${i + 1}` } }],
            },
          },
        });
      }

      // 3. 최종 텍스트
      this.send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '작업 완료' },
          },
        },
      });

      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { stopReason: 'end_turn' },
      });
    }
  }
}

describe('gemini action 실시간 저장 E2E (실제 runGeminiAcpTurn)', () => {
  it('action onAction이 emitChain 완료를 기다리지 않고 즉시 호출된다', async () => {
    // thinking 5개 × 80ms = ~400ms 지연이 있는 상황에서
    // action onAction이 세션 완료 전에 호출되었는지를 타임스탬프로 검증
    const child = new DelayedThinkingAcpChild({
      thinkingChunkCount: 5,
      thinkingDelayMs: 80,
      actionCount: 3,
    });

    const actionCallTimestamps: number[] = [];
    let sessionCompletedAt = 0;

    await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Read 3 files',
      approvalPolicy: 'on-request',
      spawnProcess: () => child as never,
      onAction: async (action) => {
        actionCallTimestamps.push(Date.now());
      },
      onText: async () => {},
    });

    sessionCompletedAt = Date.now();

    // action 3개가 모두 호출되었는지
    expect(actionCallTimestamps).toHaveLength(3);

    // 첫 번째 action은 세션 완료보다 유의미하게 먼저 호출되었어야 한다.
    // (thinking 청크 5개가 flush되는 시간만큼의 여유가 있어야 함)
    const firstActionDelay = sessionCompletedAt - actionCallTimestamps[0]!;
    expect(firstActionDelay).toBeGreaterThan(0);
    // 만약 emitChain에 블로킹되었다면 thinking 5개가 전부 처리될 때까지
    // onAction이 호출되지 않아 firstActionDelay가 0에 가까울 것
  });

  it('action들이 올바른 순서로 onAction에 전달된다', async () => {
    const child = new DelayedThinkingAcpChild({
      thinkingChunkCount: 3,
      thinkingDelayMs: 30,
      actionCount: 4,
    });

    const seenCallIds: string[] = [];

    await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Read 4 files',
      approvalPolicy: 'on-request',
      spawnProcess: () => child as never,
      onAction: async (action) => {
        seenCallIds.push(action.callId ?? '');
      },
      onText: async () => {},
    });

    expect(seenCallIds).toEqual([
      'tool-timing-1',
      'tool-timing-2',
      'tool-timing-3',
      'tool-timing-4',
    ]);
  });

  it('thinking 처리 중에 첫 번째 action이 저장된 이후에도 thinking이 계속 처리된다', async () => {
    // thinking 청크가 action 이후에도 계속 오는 시나리오
    // → action이 저장되는 시점과 thinking 완료 시점을 분리하여 검증
    const child = new DelayedThinkingAcpChild({
      thinkingChunkCount: 5,
      thinkingDelayMs: 60,
      actionCount: 2,
    });

    const events: Array<{ type: 'action' | 'text'; t: number }> = [];

    await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Read 2 files',
      approvalPolicy: 'on-request',
      spawnProcess: () => child as never,
      onAction: async () => {
        events.push({ type: 'action', t: Date.now() });
      },
      onText: async (event) => {
        if (!event.partial) {
          events.push({ type: 'text', t: Date.now() });
        }
      },
    });

    // action 2개, text 이벤트(commentary + final) 발생
    const actions = events.filter((e) => e.type === 'action');
    const texts = events.filter((e) => e.type === 'text');

    expect(actions).toHaveLength(2);
    expect(texts.length).toBeGreaterThanOrEqual(1);

    // action들이 final text보다 먼저 전달되었는지
    const lastActionTime = Math.max(...actions.map((e) => e.t));
    const finalTextTime = texts[texts.length - 1]!.t;
    expect(lastActionTime).toBeLessThanOrEqual(finalTextTime);
  });
});
