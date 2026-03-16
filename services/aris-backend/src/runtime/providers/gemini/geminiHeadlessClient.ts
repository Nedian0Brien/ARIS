import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ProviderActionEvent, ProviderTextEvent } from '../../contracts/providerRuntime.js';
import type { ApprovalPolicy } from '../../../types.js';
import { buildGeminiCommand } from './geminiLauncher.js';
import { GeminiStreamAdapter } from './geminiStreamAdapter.js';
import { buildGeminiProviderTextEvent, mapGeminiCanonicalEventsToProtocol } from './geminiEventBridgeV2.js';
import type { GeminiTurnResult } from './types.js';

export type GeminiHeadlessClientOptions = {
  cwd: string;
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  preferredSessionId?: string;
  signal?: AbortSignal;
  onAction?: (action: ProviderActionEvent, meta: { threadId: string }) => Promise<void>;
  onText?: (event: ProviderTextEvent, meta: { threadId: string }) => Promise<void>;
};

export async function runGeminiHeadlessTurn(input: GeminiHeadlessClientOptions): Promise<GeminiTurnResult> {
  const launchCommand = buildGeminiCommand({
    prompt: input.prompt,
    approvalPolicy: input.approvalPolicy,
    model: input.model,
    resumeTarget: input.preferredSessionId
      ? { mode: 'resume', id: input.preferredSessionId }
      : undefined,
  });

  const child = spawn(launchCommand.command, launchCommand.args, {
    cwd: input.cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: input.signal,
  });

  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error('gemini headless stdio streams are unavailable');
  }

  // stdin은 즉시 닫아서 headless 모드로 동작하게 함
  child.stdin.end();

  const adapter = new GeminiStreamAdapter();
  const stdoutLines = createInterface({ input: child.stdout });
  let stderr = '';
  let threadId = '';
  let providerErrorDetail = '';
  let emitChain: Promise<void> = Promise.resolve();
  let streamedActionCount = 0;
  let agentMessagePersisted = false;

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  });

  stdoutLines.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const canonicalEvents = adapter.processLine(trimmed);
    for (const event of canonicalEvents) {
      if (event.threadId) {
        threadId = event.threadId;
      }

      if (event.type === 'turn_failed' && event.errorText) {
        providerErrorDetail = event.errorText;
      }

      if (event.type === 'tool_completed' && input.onAction) {
        const capturedEvent = event;
        const capturedThreadId = threadId;
        emitChain = emitChain.then(async () => {
          await input.onAction!(capturedEvent.action, { threadId: capturedThreadId });
          streamedActionCount += 1;
        });
      }

      if (input.onText) {
        const textEvent = buildGeminiProviderTextEvent(event);
        if (textEvent) {
          if (!textEvent.partial) {
            agentMessagePersisted = true;
          }
          const capturedTextEvent = textEvent;
          const capturedThreadId = threadId;
          emitChain = emitChain.then(async () => {
            await input.onText!(
              { ...capturedTextEvent, ...(capturedThreadId ? { threadId: capturedThreadId } : {}) },
              { threadId: capturedThreadId },
            );
          });
        }
      }
    }
  });

  const childClosed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', (err) => {
      // resume 실패 시 fallback args로 재시도
      if (launchCommand.retryArgsOnFailure && launchCommand.retryArgsOnFailure.length > 0) {
        resolve({ code: 1, signal: null });
      } else {
        reject(err);
      }
    });
    child.once('close', (code, sig) => resolve({ code, signal: sig }));
  });

  await childClosed;
  await emitChain;

  // resume 실패로 비정상 종료된 경우 retryArgsOnFailure로 재시도
  const summary = adapter.summarize();
  const hasOutput = summary.output.trim().length > 0 || summary.events.length > 0;

  if (!hasOutput && launchCommand.retryArgsOnFailure && launchCommand.retryArgsOnFailure.length > 0) {
    return runGeminiHeadlessTurn({
      ...input,
      preferredSessionId: undefined,
    });
  }

  if (providerErrorDetail) {
    const err = new Error(providerErrorDetail);
    if (threadId) {
      Object.assign(err, { threadId });
    }
    throw err;
  }

  const protocolEnvelopes = mapGeminiCanonicalEventsToProtocol(summary.events);

  return {
    output: summary.output,
    cwd: input.cwd,
    threadId: threadId || undefined,
    threadIdSource: 'observed' as const,
    inferredActions: streamedActionCount > 0 ? [] : summary.actions,
    streamedActionsPersisted: streamedActionCount > 0,
    agentMessagePersisted,
    protocolEnvelopes,
  };
}
