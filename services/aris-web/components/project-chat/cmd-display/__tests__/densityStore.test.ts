import { describe, it, expect, beforeEach } from 'vitest';
import { useDensityStore } from '../densityStore';

describe('useDensityStore', () => {
  beforeEach(() => {
    useDensityStore.setState({ global: 'auto', overrides: {} });
  });

  it('defaults to auto mode', () => {
    expect(useDensityStore.getState().global).toBe('auto');
  });

  it('setGlobal updates the mode', () => {
    useDensityStore.getState().setGlobal('expanded');
    expect(useDensityStore.getState().global).toBe('expanded');
  });

  it('toggleOverride flips a card between expanded and unset', () => {
    const { toggleOverride } = useDensityStore.getState();
    toggleOverride('evt-1');
    expect(useDensityStore.getState().overrides['evt-1']).toBe('expanded');
    toggleOverride('evt-1');
    expect(useDensityStore.getState().overrides['evt-1']).toBeUndefined();
  });

  it('per-card override wins over global', () => {
    useDensityStore.getState().setGlobal('minimal');
    useDensityStore.getState().toggleOverride('evt-1');
    expect(useDensityStore.getState().densityFor('evt-1', 'minimal')).toBe('expanded');
    expect(useDensityStore.getState().densityFor('evt-2', 'minimal')).toBe('minimal');
  });
});
