/**
 * CliProviderRegistry — singleton registry for CliProvider implementations.
 *
 * Adapted from horang-labs/tessera (`src/lib/cli/providers/registry.ts`).
 *
 * Providers are registered by their AgentFlavor id (`'claude' | 'codex' |
 * 'gemini'`). Unknown ids throw on lookup so session creation paths fail
 * loudly instead of silently swapping providers.
 *
 * The registry instance is stored on `globalThis` under a Symbol key so it
 * survives `tsx watch` reloads and webpack module duplication on the API
 * route side. This matters because aris-backend dev mode hot-reloads modules
 * without restarting the process — re-registering on every reload would
 * either thrash the registry or silently leave stale instances.
 *
 * Phase 1 introduces the registry. No provider is registered yet; that
 * happens in Phase 2 (Codex) and Phase 4 (Claude/Gemini migration).
 */

import type { CliProvider } from './cliProvider.js';
import type { ProviderRuntimeFlavor } from './providerRuntime.js';

export class CliProviderRegistry {
  private readonly providers = new Map<ProviderRuntimeFlavor, CliProvider>();

  /**
   * Register a provider under the given id. Re-registering an existing id
   * replaces the previous implementation — useful for tests but a code smell
   * in production code, where `registerIfAbsent` should be preferred.
   */
  register(id: ProviderRuntimeFlavor, provider: CliProvider): void {
    this.providers.set(id, provider);
  }

  /**
   * Register a provider only when the slot is still empty. Returns the
   * existing provider when one was already registered. Idempotent — safe to
   * call from bootstrap modules that may be re-imported under hot reload.
   */
  registerIfAbsent(
    id: ProviderRuntimeFlavor,
    createProvider: () => CliProvider,
  ): CliProvider {
    const existing = this.providers.get(id);
    if (existing) {
      return existing;
    }

    const provider = createProvider();
    this.providers.set(id, provider);
    return provider;
  }

  /**
   * Returns true when a provider has been registered for the id. Does not
   * perform any availability or status check.
   */
  hasProvider(id: ProviderRuntimeFlavor): boolean {
    return this.providers.has(id);
  }

  /**
   * Returns ids of all registered providers in registration order. Does not
   * perform any availability check.
   */
  getProviderIds(): ProviderRuntimeFlavor[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Returns the provider for the given id. Throws when the id is unknown so
   * callers do not silently fall back to a different provider.
   */
  getProvider(id: ProviderRuntimeFlavor): CliProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`CliProviderRegistry: unknown provider id="${id}"`);
    }
    return provider;
  }

  /**
   * Test-only helper to wipe the registry. Public so test files can use it
   * without reaching into internals; production code should never call this.
   */
  clearForTesting(): void {
    this.providers.clear();
  }
}

/**
 * Singleton instance. Stored on globalThis so it survives `tsx watch` module
 * reloads (the dev runner re-imports source files into the same process).
 */
const REGISTRY_KEY = Symbol.for('aris.cliProviderRegistry');
const _global = globalThis as unknown as Record<symbol, CliProviderRegistry | undefined>;

export const cliProviderRegistry: CliProviderRegistry =
  _global[REGISTRY_KEY] ?? (_global[REGISTRY_KEY] = new CliProviderRegistry());
