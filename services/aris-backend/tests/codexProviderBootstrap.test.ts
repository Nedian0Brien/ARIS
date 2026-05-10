import { afterEach, describe, expect, it } from 'vitest';
import { cliProviderRegistry } from '../src/runtime/contracts/providerRegistry.js';
import { registerCodexProvider } from '../src/runtime/providers/codex/bootstrap.js';

describe('codex provider bootstrap', () => {
  afterEach(() => {
    cliProviderRegistry.clearForTesting();
  });

  it('registers the codex adapter in the shared provider registry', () => {
    cliProviderRegistry.clearForTesting();

    registerCodexProvider();

    expect(cliProviderRegistry.getProvider('codex').getProviderId()).toBe('codex');
  });
});
