import { describe, expect, it } from 'vitest';
import { resolveRuntimePollResolution } from '@/lib/hooks/useSessionRuntime';

describe('resolveRuntimePollResolution', () => {
  it('accepts successful runtime sync results and updates the cached running state', () => {
    expect(resolveRuntimePollResolution({
      previousIsRunning: false,
      nextIsRunning: true,
    })).toEqual({
      nextIsRunning: true,
      runtimeError: null,
      shouldCache: true,
      shouldStop: false,
    });
  });

  it('preserves the previous running state when a transient poll error occurs', () => {
    expect(resolveRuntimePollResolution({
      previousIsRunning: true,
      errorMessage: 'Runtime status sync failed (502)',
    })).toEqual({
      nextIsRunning: true,
      runtimeError: 'Runtime status sync failed (502)',
      shouldCache: false,
      shouldStop: false,
    });
  });

  it('forces the runtime state to idle when the workspace is gone', () => {
    expect(resolveRuntimePollResolution({
      previousIsRunning: true,
      notFound: true,
    })).toEqual({
      nextIsRunning: false,
      runtimeError: '워크스페이스가 종료되었거나 삭제되었습니다.',
      shouldCache: true,
      shouldStop: true,
    });
  });
});
