/**
 * CLI provider connection status types.
 *
 * Three-state model adapted from horang-labs/tessera (`src/lib/cli/providers/provider-contract.ts`).
 * Replaces the implicit boolean availability check with a richer status that
 * distinguishes "binary missing" from "binary present but auth failing".
 *
 * Status semantics:
 *  - "connected":     binary runs AND auth check succeeds.
 *  - "needs_login":   binary runs but auth check fails (e.g. logged out).
 *  - "not_installed": binary missing OR execution failed (ENOENT, timeout,
 *                     non-zero exit on `--version`).
 */

export type CliConnectionStatus = 'connected' | 'needs_login' | 'not_installed';

/**
 * Result of one CLI status probe for a given environment.
 */
export interface CliStatusResult {
  status: CliConnectionStatus;
  /** Optional CLI version string (omitted when status === 'not_installed'). */
  version?: string;
  /**
   * Optional free-form error message when status !== 'connected'. Shown to
   * users in setup/diagnostics views; never fed back into CLI commands.
   */
  errorMessage?: string;
}

/**
 * Input options to a status probe.
 *
 * Environment selection is included for forward-compatibility (Windows + WSL
 * support). aris-backend currently runs on Linux only, so the default
 * environment is "native".
 */
export interface CheckStatusOptions {
  /**
   * "native" — spawn the binary directly on the host.
   * "wsl"    — spawn through wsl.exe on Windows. Currently unsupported on the
   *            ARIS server but kept for parity with Tessera's interface so
   *            providers don't have to re-shape later.
   */
  environment: 'native' | 'wsl';
}

export const DEFAULT_CHECK_STATUS_OPTIONS: CheckStatusOptions = {
  environment: 'native',
};
