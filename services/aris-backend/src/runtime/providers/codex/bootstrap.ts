/**
 * Codex provider bootstrap.
 *
 * Side-effect module that registers the codex adapter with the
 * `cliProviderRegistry`. Mirrors Tessera's
 * `src/lib/cli/providers/bootstrap.ts` pattern: imported once from the
 * server entry point so the registration happens exactly once and
 * survives `tsx watch` hot reload via `registerIfAbsent`.
 *
 * Phase 2 Sprint 2 keeps this module **un-imported** from any runtime
 * entry. The registry stays empty at runtime; the structural slot is
 * ready for Sprint 6 to wire by adding a single import in `server.ts`
 * (or a top-level barrel). Keeping the registration dormant until then
 * means Sprint 2 is purely additive and cannot perturb existing code
 * paths.
 */

import { cliProviderRegistry } from '../../contracts/providerRegistry.js';
import { codexAdapter } from './codexAdapter.js';

cliProviderRegistry.registerIfAbsent('codex', () => codexAdapter);
