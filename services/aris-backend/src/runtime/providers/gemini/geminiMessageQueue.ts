import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import {
  projectGeminiTextMessage,
  projectGeminiToolActionMessage,
  type GeminiPersistedMessageProjection,
} from './geminiEventBridge.js';
import type { GeminiActionEvent } from './types.js';

type GeminiMessageQueueContext = {
  chatId?: string;
  requestedPath: string;
  model?: string;
};

type GeminiProjectionPersister = (projection: GeminiPersistedMessageProjection) => Promise<void>;

export class GeminiMessageQueue {
  private chain: Promise<void> = Promise.resolve();
  private actionIndex = 0;

  constructor(
    private readonly context: GeminiMessageQueueContext,
    private readonly persist: GeminiProjectionPersister,
  ) {}

  enqueueToolAction(input: {
    action: GeminiActionEvent;
    execCwd: string;
    threadId?: string;
    envelopes?: SessionProtocolEnvelope[];
  }): Promise<void> {
    return this.enqueueProjection(projectGeminiToolActionMessage({
      action: input.action,
      actionIndex: this.actionIndex++,
      ...(this.context.chatId ? { chatId: this.context.chatId } : {}),
      requestedPath: this.context.requestedPath,
      execCwd: input.execCwd,
      ...(this.context.model ? { model: this.context.model } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      envelopes: input.envelopes,
    }));
  }

  enqueueText(input: {
    output: string;
    execCwd?: string;
    threadId?: string;
    messageMeta?: Record<string, unknown>;
    envelopes?: SessionProtocolEnvelope[];
  }): Promise<void> {
    return this.enqueueProjection(projectGeminiTextMessage({
      output: input.output,
      ...(this.context.chatId ? { chatId: this.context.chatId } : {}),
      requestedPath: this.context.requestedPath,
      ...(input.execCwd ? { execCwd: input.execCwd } : {}),
      ...(this.context.model ? { model: this.context.model } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.messageMeta ? { messageMeta: input.messageMeta } : {}),
      envelopes: input.envelopes,
    }));
  }

  flush(): Promise<void> {
    return this.chain;
  }

  private enqueueProjection(projection: GeminiPersistedMessageProjection | null): Promise<void> {
    if (!projection) {
      return this.chain;
    }

    this.chain = this.chain.then(() => this.persist(projection));
    return this.chain;
  }
}
