export type SessionScrollPhase =
  | 'idle'
  | 'user-scrolling'
  | 'restoring-tail'
  | 'loading-older'
  | 'resuming'
  | 'viewport-reflow';

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

type ResolveSessionScrollPhaseInput = {
  currentPhase: SessionScrollPhase;
  event: SessionScrollPhaseEvent;
};

export function resolveSessionScrollPhase(input: ResolveSessionScrollPhaseInput): SessionScrollPhase {
  switch (input.event) {
    case 'resume-start':
      return 'resuming';
    case 'viewport-changed':
      return input.currentPhase === 'resuming' || input.currentPhase === 'viewport-reflow'
        ? 'viewport-reflow'
        : input.currentPhase;
    case 'resume-stable':
      return input.currentPhase === 'resuming' || input.currentPhase === 'viewport-reflow'
        ? 'idle'
        : input.currentPhase;
    case 'tail-restore-start':
      return 'restoring-tail';
    case 'tail-restore-complete':
      return input.currentPhase === 'restoring-tail' ? 'idle' : input.currentPhase;
    case 'older-load-start':
      return 'loading-older';
    case 'older-load-complete':
      return input.currentPhase === 'loading-older' ? 'idle' : input.currentPhase;
    case 'user-scroll':
      return input.currentPhase === 'idle' ? 'user-scrolling' : input.currentPhase;
    case 'scroll-observed':
    default:
      return input.currentPhase;
  }
}
