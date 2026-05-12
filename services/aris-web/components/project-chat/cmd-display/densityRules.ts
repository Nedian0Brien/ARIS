import type { ResolvedDensity } from './densityStore';

export function computeAutoDensity(input: { isRunning: boolean; distanceFromLatest: number; isError: boolean }): ResolvedDensity {
  if (input.isRunning) return 'expanded';
  if (input.isError) return 'default';
  if (input.distanceFromLatest === 0) return 'default';
  return 'minimal';
}
