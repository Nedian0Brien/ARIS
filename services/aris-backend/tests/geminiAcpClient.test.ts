import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { inspectGeminiAcpSessionCapabilities, runGeminiAcpTurn } from '../src/runtime/providers/gemini/geminiAcpClient.js';

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  private buffer = '';
  private pendingPermission: { promptRequestId: string; sessionId: string } | null = null;

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
      result?: Record<string, unknown>;
    };

    if (!msg.method && msg.id === 'permission-request-1' && this.pendingPermission) {
      const outcome = String(msg.result?.outcome?.outcome ?? '');
      if (outcome === 'selected') {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: this.pendingPermission.sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-permission-1',
              status: 'in_progress',
              title: 'Run pwd',
              kind: 'execute',
              rawInput: {
                command: 'pwd',
              },
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: this.pendingPermission.sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'tool-permission-1',
              status: 'completed',
              content: [
                {
                  type: 'content',
                  content: {
                    type: 'text',
                    text: '/tmp',
                  },
                },
              ],
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: this.pendingPermission.sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'approved run' },
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          id: this.pendingPermission.promptRequestId,
          result: { stopReason: 'end_turn' },
        });
      }
      this.pendingPermission = null;
      return;
    }

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
          sessionId: 'gemini-session-new',
          modes: {
            currentModeId: 'default',
            availableModes: [
              { id: 'default', label: 'Default' },
              { id: 'plan', label: 'Plan' },
              { id: 'yolo', label: 'YOLO' },
            ],
          },
          models: {
            currentModelId: 'auto-gemini-3',
            availableModels: [
              { id: 'auto-gemini-3', label: 'Gemini 3 Auto' },
              { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            ],
          },
        },
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
      const promptText = Array.isArray(msg.params?.prompt)
        ? String((msg.params?.prompt as Array<Record<string, unknown>>)[0]?.text ?? '')
        : '';
      if (promptText.includes('Need commentary')) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_thought_chunk',
              content: { type: 'text', text: '먼저 ' },
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_thought_chunk',
              content: { type: 'text', text: '구성을 확인합니다.' },
            },
          },
        });
      }
      if (promptText.includes('Read package.json')) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-read-1',
              status: 'in_progress',
              title: 'Read package.json',
              kind: 'read',
              locations: [{ path: '/tmp/package.json' }],
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
              toolCallId: 'tool-read-1',
              status: 'completed',
              content: [
                {
                  type: 'content',
                  content: {
                    type: 'text',
                    text: '{\"name\":\"aris\"}',
                  },
                },
              ],
            },
          },
        });
      }
      if (promptText.includes('Run pwd')) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-cmd-1',
              status: 'in_progress',
              title: 'Run pwd',
              kind: 'execute',
              rawInput: {
                command: 'pwd',
              },
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
              toolCallId: 'tool-cmd-1',
              status: 'completed',
              content: [
                {
                  type: 'content',
                  content: {
                    type: 'text',
                    text: '/tmp',
                  },
                },
              ],
            },
          },
        });
      }
      if (promptText.includes('Need permission')) {
        this.pendingPermission = {
          promptRequestId: String(msg.id ?? ''),
          sessionId,
        };
        this.send({
          jsonrpc: '2.0',
          id: 'permission-request-1',
          method: 'session/request_permission',
          params: {
            sessionId,
            options: [
              { optionId: 'allow-once', kind: 'allow_once' },
              { optionId: 'allow-always', kind: 'allow_always' },
              { optionId: 'reject-once', kind: 'reject_once' },
            ],
            toolCall: {
              toolCallId: 'tool-permission-1',
              status: 'pending',
              title: 'Run pwd',
              kind: 'execute',
              locations: [],
            },
          },
        });
        return;
      }
      if (promptText.includes('Late action')) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'done' },
            },
          },
        });
        this.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { stopReason: 'end_turn' },
        });
        setTimeout(() => {
          this.send({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId,
              update: {
                sessionUpdate: 'tool_call',
                toolCallId: 'tool-late-1',
                status: 'in_progress',
                title: 'Read delayed file',
                kind: 'read',
                locations: [{ path: '/tmp/delayed.txt' }],
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
                toolCallId: 'tool-late-1',
                status: 'completed',
                content: [
                  {
                    type: 'content',
                    content: {
                      type: 'text',
                      text: 'late output',
                    },
                  },
                ],
              },
            },
          });
        }, 120);
        return;
      }
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
  it('reads Gemini ACP mode and model catalogs from a fresh session', async () => {
    const capabilities = await inspectGeminiAcpSessionCapabilities({
      cwd: '/tmp',
      spawnProcess: createFakeSpawn(),
    });

    expect(capabilities.sessionId).toBe('gemini-session-new');
    expect(capabilities.modes.currentModeId).toBe('default');
    expect(capabilities.modes.availableModes.map((mode) => mode.id)).toEqual(['default', 'plan', 'yolo']);
    expect(capabilities.models.currentModelId).toBe('auto-gemini-3');
    expect(capabilities.models.availableModels.map((model) => model.id)).toEqual(['auto-gemini-3', 'gemini-2.5-pro']);
  });

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

  it('emits completed ACP file-read actions and records tool envelopes', async () => {
    const seenActions: Array<{
      actionType: string;
      path?: string;
      output?: string;
    }> = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Read package.json and answer briefly',
      approvalPolicy: 'on-request',
      spawnProcess: createFakeSpawn(),
      onAction: async (action) => {
        seenActions.push({
          actionType: action.actionType,
          path: action.path,
          output: action.output,
        });
      },
    });

    expect(seenActions).toEqual([
      {
        actionType: 'file_read',
        path: '/tmp/package.json',
        output: '{"name":"aris"}',
      },
    ]);
    expect(result.streamedActionsPersisted).toBe(true);
    expect(result.inferredActions).toEqual([]);
    expect(result.protocolEnvelopes?.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('falls back to inferredActions when no onAction handler is provided', async () => {
    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Run pwd',
      approvalPolicy: 'on-request',
      spawnProcess: createFakeSpawn(),
    });

    expect(result.streamedActionsPersisted).toBe(false);
    expect(result.inferredActions).toEqual([
      expect.objectContaining({
        actionType: 'command_execution',
        command: 'pwd',
        output: '/tmp',
        callId: 'tool-cmd-1',
      }),
    ]);
  });

  it('flushes agent_thought_chunk into separate commentary events before the final answer', async () => {
    const seen: string[] = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Need commentary',
      approvalPolicy: 'on-request',
      spawnProcess: createFakeSpawn(),
      onText: async (event) => {
        seen.push(`${event.phase ?? 'final'}:${event.partial ? 'partial' : 'final'}:${event.text}`);
      },
    });

    expect(seen).toEqual([
      'commentary:partial:먼저 ',
      'commentary:partial:구성을 확인합니다.',
      'commentary:final:먼저 구성을 확인합니다.',
      'final:partial:Hello',
      'final:partial: ACP',
      'final:final:Hello ACP',
    ]);
    expect(result.protocolEnvelopes?.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('bridges Gemini ACP permission requests through onPermission and resumes the turn', async () => {
    const seenPermissions: Array<{ approvalId?: string; callId: string; risk: string }> = [];
    const seenActions: string[] = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Need permission',
      approvalPolicy: 'on-request',
      spawnProcess: createFakeSpawn(),
      onPermission: async (request) => {
        seenPermissions.push({
          approvalId: request.approvalId,
          callId: request.callId,
          risk: request.risk,
        });
        return 'allow_once';
      },
      onAction: async (action) => {
        seenActions.push(`${action.actionType}:${action.command}:${action.output}`);
      },
    });

    expect(seenPermissions).toEqual([
      {
        approvalId: 'permission-request-1',
        callId: 'tool-permission-1',
        risk: 'high',
      },
    ]);
    expect(seenActions).toEqual([
      'command_execution:pwd:/tmp',
    ]);
    expect(result.output).toBe('approved run');
    expect(result.streamedActionsPersisted).toBe(true);
  });

  it('waits for late Gemini tool updates before finalizing the turn', async () => {
    const seen: string[] = [];

    const result = await runGeminiAcpTurn({
      cwd: '/tmp',
      prompt: 'Late action',
      approvalPolicy: 'on-request',
      spawnProcess: createFakeSpawn(),
      onAction: async (action) => {
        seen.push(`action:${action.path}:${action.output}`);
      },
      onText: async (event) => {
        if (!event.partial && event.phase === 'final') {
          seen.push(`final:${event.text}`);
        }
      },
    });

    expect(result.output).toBe('done');
    expect(seen).toEqual([
      'action:/tmp/delayed.txt:late output',
      'final:done',
    ]);
  });
});
