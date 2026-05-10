/**
 * Codex provider bootstrap.
 *
 * Side-effect module that registers the codex adapter with the
 * `cliProviderRegistry`. Mirrors Tessera's
 * `src/lib/cli/providers/bootstrap.ts` pattern: imported once from the
 * server entry point so the registration happens exactly once and
 * survives `tsx watch` hot reload via `registerIfAbsent`.
 */

import { cliProviderRegistry } from '../../contracts/providerRegistry.js';
import { codexAdapter } from './codexAdapter.js';

export function registerCodexProvider(): void {
  cliProviderRegistry.registerIfAbsent('codex', () => codexAdapter);
}

registerCodexProvider();
