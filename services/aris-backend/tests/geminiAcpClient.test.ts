import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runGeminiAcpTurn } from '../src/runtime/providers/gemini/geminiAcpClient.js';

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  private buffer = '';

  constructor() {
    super();
    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (chunk: string) => {
      this.buffer += chunk;
      let lineEnd = this.buffer.indexOf('\n');
      while (lineEnd >= 0) {
        const line = this.buffer.slice(0, lineEnd).trim();
        this.buffer = this.buffer.slice(lineEnd + 1);
        if (line) {
          this.handleLine(line);
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
    this.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  private handleLine(line: string) {
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
        result: { sessionId: 'gemini-session-new' },
      });
      return;
    }

    if (msg.method === 'session/load') {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { modes: { availableModes: [], currentModeId: 'default' } },
      });
      this.send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'gemini-session-loaded',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'old reply' },
          },
        },
      });
      return;
    }

    if (msg.method === 'session/set_mode') {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {},
      });
      return;
    }

    if (msg.method === 'session/set_model') {
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {},
      });
      return;
    }

    if (msg.method === 'session/prompt') {
      const sessionId = String(msg.params?.sessionId ?? '');
      const chunks = sessionId === 'gemini-session-loaded'
        ? ['New', ' reply']
        : ['Hello', ' ACP'];
      for (const chunk of chunks) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: chunk },
            },
          },
        });
      }
      this.send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { stopReason: 'end_turn' },
      });
    }
  }
}

function createFakeSpawn() {
  return () => new FakeAcpChild() as never;
}

describe('runGeminiAcpTurn', () => {
  it('streams partial text and emits a completed final message for a new ACP session', async () => {
    const seen: string[] = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Say hello',
      approvalPolicy: 'on-request',
      model: 'gemini-2.5-pro',
      spawnProcess: createFakeSpawn(),
      onText: async (event) => {
        seen.push(`${event.partial ? 'partial' : 'final'}:${event.text}`);
      },
    });

    expect(seen).toEqual([
      'partial:Hello',
      'partial: ACP',
      'final:Hello ACP',
    ]);
    expect(result.output).toBe('Hello ACP');
    expect(result.threadId).toBe('gemini-session-new');
    expect(result.threadIdSource).toBe('observed');
  });

  it('ignores loadSession history replay before prompting the resumed session', async () => {
    const seen: string[] = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Continue',
      approvalPolicy: 'on-request',
      preferredSessionId: 'gemini-session-loaded',
      spawnProcess: createFakeSpawn(),
      onText: async (event) => {
        seen.push(`${event.partial ? 'partial' : 'final'}:${event.text}`);
      },
    });

    expect(seen).toEqual([
      'partial:New',
      'partial: reply',
      'final:New reply',
    ]);
    expect(result.output).toBe('New reply');
    expect(result.threadId).toBe('gemini-session-loaded');
    expect(result.threadIdSource).toBe('resume');
  });
});
