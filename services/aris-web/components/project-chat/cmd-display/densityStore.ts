import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DensityMode = 'auto' | 'expanded' | 'default' | 'minimal';
export type ResolvedDensity = 'expanded' | 'default' | 'minimal';

type State = { global: DensityMode; overrides: Record<string, 'expanded'> };
type Actions = {
  setGlobal: (mode: DensityMode) => void;
  toggleOverride: (id: string) => void;
  clearOverrides: () => void;
  densityFor: (id: string, autoResolved: ResolvedDensity) => ResolvedDensity;
};

export const useDensityStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      global: 'auto',
      overrides: {},
      setGlobal: (mode) => set({ global: mode }),
      toggleOverride: (id) => set((s) => {
        const next = { ...s.overrides };
        if (next[id]) delete next[id]; else next[id] = 'expanded';
        return { overrides: next };
      }),
      clearOverrides: () => set({ overrides: {} }),
      densityFor: (id, autoResolved) => {
        const { global, overrides } = get();
        if (overrides[id]) return 'expanded';
        if (global === 'auto') return autoResolved;
        return global;
      },
    }),
    { name: 'aris.chat.density', partialize: (s) => ({ global: s.global }) },
  ),
);
