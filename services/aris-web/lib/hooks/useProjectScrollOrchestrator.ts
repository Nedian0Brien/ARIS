'use client';

import { useSyncExternalStore } from 'react';

import {
  resolveProjectScrollPhase,
  type ProjectScrollPhase,
  type ProjectScrollPhaseEvent,
} from '@/lib/scroll/projectScrollPhase';
import { recordScrollDebugEvent } from '@/lib/scroll/scrollDebug';

export type ProjectScrollOrchestratorSnapshot = {
  isActive: boolean;
  phase: ProjectScrollPhase;
};

type ProjectScrollOrchestratorStore = {
  activate: () => void;
  deactivate: () => void;
  dispatch: (event: ProjectScrollPhaseEvent) => void;
  getSnapshot: () => ProjectScrollOrchestratorSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export function createProjectScrollOrchestratorStore(): ProjectScrollOrchestratorStore {
  const listeners = new Set<() => void>();
  let activeCount = 0;
  let snapshot: ProjectScrollOrchestratorSnapshot = {
    isActive: false,
    phase: 'idle',
  };

  const emit = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const setSnapshot = (next: ProjectScrollOrchestratorSnapshot) => {
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
        phase: resolveProjectScrollPhase({
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

const projectScrollOrchestratorStore = createProjectScrollOrchestratorStore();

export function useProjectScrollOrchestrator() {
  return useSyncExternalStore(
    projectScrollOrchestratorStore.subscribe,
    projectScrollOrchestratorStore.getSnapshot,
    projectScrollOrchestratorStore.getSnapshot,
  );
}

export function activateProjectScrollOrchestrator() {
  projectScrollOrchestratorStore.activate();
}

export function deactivateProjectScrollOrchestrator() {
  projectScrollOrchestratorStore.deactivate();
}

export function dispatchProjectScrollPhaseEvent(event: ProjectScrollPhaseEvent) {
  const previous = projectScrollOrchestratorStore.getSnapshot();
  projectScrollOrchestratorStore.dispatch(event);
  const next = projectScrollOrchestratorStore.getSnapshot();
  if (previous.isActive || next.isActive) {
    recordScrollDebugEvent({
      kind: 'phase',
      source: `project-scroll:${event}`,
      phase: next.phase,
      detail: {
        previousPhase: previous.phase,
        nextActive: next.isActive,
      },
    });
  }
}

export function getProjectScrollOrchestratorSnapshot() {
  return projectScrollOrchestratorStore.getSnapshot();
}
