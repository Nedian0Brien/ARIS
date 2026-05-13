'use client';

import { useSyncExternalStore } from 'react';

import { resolveSessionScrollPhase, type SessionScrollPhase } from './chatScroll';
import { recordScrollDebugEvent } from './scrollDebug';

export type SessionScrollPhaseEvent =
  | 'resume-start'
  | 'scroll-observed'
  | 'viewport-changed'
  | 'resume-stable'
  | 'tail-restore-start'
  | 'tail-restore-complete'
  | 'older-load-start'
  | 'older-load-complete'
  | 'user-scroll';

export type SessionScrollOrchestratorSnapshot = {
  isActive: boolean;
  phase: SessionScrollPhase;
};

type SessionScrollOrchestratorStore = {
  activate: () => void;
  deactivate: () => void;
  dispatch: (event: SessionScrollPhaseEvent) => void;
  getSnapshot: () => SessionScrollOrchestratorSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export function createSessionScrollOrchestratorStore(): SessionScrollOrchestratorStore {
  const listeners = new Set<() => void>();
  let activeCount = 0;
  let snapshot: SessionScrollOrchestratorSnapshot = {
    isActive: false,
    phase: 'idle',
  };

  const emit = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const setSnapshot = (next: SessionScrollOrchestratorSnapshot) => {
    if (snapshot.isActive === next.isActive && snapshot.phase === next.phase) {
      return;
    }
    snapshot = next;
    emit();
  };

  return {
    activate() {
      activeCount += 1;
      setSnapshot({
        isActive: true,
        phase: activeCount > 0 ? snapshot.phase : 'idle',
      });
    },
    deactivate() {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) {
        setSnapshot({
          isActive: false,
          phase: 'idle',
        });
      }
    },
    dispatch(event) {
      if (!snapshot.isActive) {
        return;
      }
      setSnapshot({
        isActive: true,
        phase: resolveSessionScrollPhase({
          currentPhase: snapshot.phase,
          event,
        }),
      });
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const sessionScrollOrchestratorStore = createSessionScrollOrchestratorStore();

export function useSessionScrollOrchestrator() {
  return useSyncExternalStore(
    sessionScrollOrchestratorStore.subscribe,
    sessionScrollOrchestratorStore.getSnapshot,
    sessionScrollOrchestratorStore.getSnapshot,
  );
}

export function activateSessionScrollOrchestrator() {
  sessionScrollOrchestratorStore.activate();
}

export function deactivateSessionScrollOrchestrator() {
  sessionScrollOrchestratorStore.deactivate();
}

export function dispatchSessionScrollPhaseEvent(event: SessionScrollPhaseEvent) {
  const previous = sessionScrollOrchestratorStore.getSnapshot();
  sessionScrollOrchestratorStore.dispatch(event);
  const next = sessionScrollOrchestratorStore.getSnapshot();
  if (previous.isActive || next.isActive) {
    recordScrollDebugEvent({
      kind: 'phase',
      source: `session-scroll:${event}`,
      phase: next.phase,
      detail: {
        previousPhase: previous.phase,
        nextActive: next.isActive,
      },
    });
  }
}

export function getSessionScrollOrchestratorSnapshot() {
  return sessionScrollOrchestratorStore.getSnapshot();
}
