import type { GeminiCanonicalEvent } from './geminiCanonicalEvents.js';

type GeminiIdentityContext = {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  callId?: string;
};

export class GeminiIdentityAssembler {
  private latestContext: GeminiIdentityContext = {};
  private readonly itemContexts = new Map<string, GeminiIdentityContext>();
  private readonly callContexts = new Map<string, GeminiIdentityContext>();

  hydrate<TEvent extends GeminiCanonicalEvent>(event: TEvent): TEvent {
    const itemContext = event.itemId ? this.itemContexts.get(event.itemId) : undefined;
    const callContext = event.callId ? this.callContexts.get(event.callId) : undefined;
    const merged: TEvent = {
      ...event,
      ...(event.threadId ? {} : itemContext?.threadId ? { threadId: itemContext.threadId } : callContext?.threadId ? { threadId: callContext.threadId } : this.latestContext.threadId ? { threadId: this.latestContext.threadId } : {}),
      ...(event.turnId ? {} : itemContext?.turnId ? { turnId: itemContext.turnId } : callContext?.turnId ? { turnId: callContext.turnId } : this.latestContext.turnId ? { turnId: this.latestContext.turnId } : {}),
      ...(event.itemId ? {} : itemContext?.itemId ? { itemId: itemContext.itemId } : this.latestContext.itemId ? { itemId: this.latestContext.itemId } : {}),
      ...(event.callId ? {} : callContext?.callId ? { callId: callContext.callId } : this.latestContext.callId ? { callId: this.latestContext.callId } : {}),
    };

    const context: GeminiIdentityContext = {
      threadId: merged.threadId ?? itemContext?.threadId ?? callContext?.threadId ?? this.latestContext.threadId,
      turnId: merged.turnId ?? itemContext?.turnId ?? callContext?.turnId ?? this.latestContext.turnId,
      itemId: merged.itemId ?? itemContext?.itemId ?? this.latestContext.itemId,
      callId: merged.callId ?? callContext?.callId ?? this.latestContext.callId,
    };

    this.latestContext = context;
    if (merged.itemId) {
      this.itemContexts.set(merged.itemId, context);
    }
    if (merged.callId) {
      this.callContexts.set(merged.callId, context);
    }

    return merged;
  }
}
