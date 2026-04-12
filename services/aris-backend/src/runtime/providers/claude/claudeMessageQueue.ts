import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import type { ClaudeSessionLaunchMode } from './claudeSessionContract.js';
import {
  projectClaudeTextMessage,
  projectClaudeToolActionMessage,
  type PersistedMessageProjection,
} from './claudeEventBridge.js';
import type { ClaudeActionEvent } from './types.js';

type ClaudeMessageQueueContext = {
  chatId?: string;
  requestedPath: string;
  model?: string;
  launchMode: ClaudeSessionLaunchMode;
};

type ClaudeProjectionPersister = (projection: PersistedMessageProjection) => Promise<void>;

export class ClaudeMessageQueue {
  private chain: Promise<void> = Promise.resolve();
  private actionIndex = 0;

  constructor(
    private readonly context: ClaudeMessageQueueContext,
    private readonly persist: ClaudeProjectionPersister,
  ) {}

  enqueueToolAction(input: {
    action: ClaudeActionEvent;
    execCwd: string;
    threadId?: string;
    envelopes?: SessionProtocolEnvelope[];
  }): Promise<void> {
    return this.enqueueProjection(projectClaudeToolActionMessage({
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
    return this.enqueueProjection(projectClaudeTextMessage({
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

  private enqueueProjection(projection: PersistedMessageProjection | null): Promise<void> {
    if (!projection) {
      return this.chain;
    }

    this.chain = this.chain
      .catch(() => undefined)
      .then(() => this.persist({
        ...projection,
        meta: {
          ...projection.meta,
          launchMode: this.context.launchMode,
        },
      }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to persist claude queued message: ${message}`);
      });
    return this.chain;
  }
}
