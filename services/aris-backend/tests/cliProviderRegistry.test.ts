import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliProviderRegistry,
  cliProviderRegistry,
} from '../src/runtime/contracts/providerRegistry.js';
import type { CliProvider } from '../src/runtime/contracts/cliProvider.js';
import type { ProviderRuntimeFlavor } from '../src/runtime/contracts/providerRuntime.js';

function makeStubProvider(id: ProviderRuntimeFlavor): CliProvider {
  return {
    getProviderId: () => id,
    getDisplayName: () => `Stub ${id}`,
    isAvailable: async () => true,
    getCliArgs: () => [],
    spawn: async () => {
      throw new Error('stub provider does not spawn');
    },
    sendMessage: () => false,
    parseStdout: () => null,
    generateTitle: undefined as never,
    checkStatus: async () => ({ status: 'connected' }),
  } as unknown as CliProvider;
}

describe('CliProviderRegistry', () => {
  afterEach(() => {
    cliProviderRegistry.clearForTesting();
  });

  it('registers and looks up providers by id', () => {
    const registry = new CliProviderRegistry();
    const provider = makeStubProvider('claude');

    registry.register('claude', provider);

    expect(registry.hasProvider('claude')).toBe(true);
    expect(registry.getProvider('claude')).toBe(provider);
  });

  it('throws on unknown ids so callers do not silently fall back', () => {
    const registry = new CliProviderRegistry();
    expect(() => registry.getProvider('codex')).toThrow(/unknown provider id="codex"/);
  });

  it('replaces an existing registration when register() is called twice', () => {
    const registry = new CliProviderRegistry();
    const first = makeStubProvider('claude');
    const second = makeStubProvider('claude');

    registry.register('claude', first);
    registry.register('claude', second);

    expect(registry.getProvider('claude')).toBe(second);
  });

  it('registerIfAbsent only invokes the factory when the slot is empty', () => {
    const registry = new CliProviderRegistry();
    const factory = vi.fn(() => makeStubProvider('codex'));

    const first = registry.registerIfAbsent('codex', factory);
    const second = registry.registerIfAbsent('codex', factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('lists registered ids in insertion order', () => {
    const registry = new CliProviderRegistry();
    registry.register('claude', makeStubProvider('claude'));
    registry.register('gemini', makeStubProvider('gemini'));
    registry.register('codex', makeStubProvider('codex'));

    expect(registry.getProviderIds()).toEqual(['claude', 'gemini', 'codex']);
  });

  it('clearForTesting wipes all registrations', () => {
    const registry = new CliProviderRegistry();
    registry.register('claude', makeStubProvider('claude'));
    registry.register('codex', makeStubProvider('codex'));

    registry.clearForTesting();

    expect(registry.hasProvider('claude')).toBe(false);
    expect(registry.hasProvider('codex')).toBe(false);
    expect(registry.getProviderIds()).toEqual([]);
  });

  it('exposes a globalThis-pinned singleton', async () => {
    const provider = makeStubProvider('claude');
    cliProviderRegistry.registerIfAbsent('claude', () => provider);

    // Re-import to simulate a second module evaluation (hot reload, separate
    // import path). The singleton is keyed on Symbol.for('aris.cliProviderRegistry')
    // so a fresh dynamic import must observe the same instance.
    const reimported = await import('../src/runtime/contracts/providerRegistry.js');
    expect(reimported.cliProviderRegistry).toBe(cliProviderRegistry);
    expect(reimported.cliProviderRegistry.getProvider('claude')).toBe(provider);
  });
});
