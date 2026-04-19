import { describe, expect, it } from 'vitest';

import { createSessionScrollOrchestratorStore } from '@/app/sessions/[sessionId]/useSessionScrollOrchestrator';

describe('sessionScrollOrchestrator', () => {
  it('activates the session scope and transitions through resume phases', () => {
    const store = createSessionScrollOrchestratorStore();

    expect(store.getSnapshot()).toEqual({
      isActive: false,
      phase: 'idle',
    });

    store.activate();
    expect(store.getSnapshot()).toEqual({
      isActive: true,
      phase: 'idle',
    });

    store.dispatch('resume-start');
    expect(store.getSnapshot()).toEqual({
      isActive: true,
      phase: 'resuming',
    });

    store.dispatch('viewport-changed');
    expect(store.getSnapshot()).toEqual({
      isActive: true,
      phase: 'viewport-reflow',
    });

    store.dispatch('resume-stable');
    expect(store.getSnapshot()).toEqual({
      isActive: true,
      phase: 'idle',
    });
  });

  it('ignores phase events while inactive and resets on final deactivate', () => {
    const store = createSessionScrollOrchestratorStore();

    store.dispatch('resume-start');
    expect(store.getSnapshot()).toEqual({
      isActive: false,
      phase: 'idle',
    });

    store.activate();
    store.dispatch('tail-restore-start');
    expect(store.getSnapshot()).toEqual({
      isActive: true,
      phase: 'restoring-tail',
    });

    store.deactivate();
    expect(store.getSnapshot()).toEqual({
      isActive: false,
      phase: 'idle',
    });
  });
});
