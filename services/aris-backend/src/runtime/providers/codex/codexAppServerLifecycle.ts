/**
 * Codex app-server process lifecycle — launch, terminate, abort.
 *
 * Manages the detached `codex app-server` child process. The process is
 * launched via an intermediate Node.js launcher script so it can be
 * fully detached from the ARIS process and its stdio can be closed without
 * affecting the WebSocket session established by `codexAppServerClient.ts`.
 *
 * Used by `runCodexAppServer` for the app-server transport.
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';

// ---------------------------------------------------------------------------
// Spawn options
// ---------------------------------------------------------------------------

/**
 * Build spawn options for the intermediate launcher process.
 *
 * `detached: true` allows the child to outlive the ARIS process; `stdio:
 * 'pipe'` is set on the launcher itself so we can read the PID from its
 * stdout — the actual codex app-server uses `stdio: 'ignore'`.
 */
export function buildCodexAppServerSpawnOptions(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}): SpawnOptionsWithoutStdio {
  return {
    cwd: input.cwd,
    env: input.env,
    stdio: 'pipe',
    signal: input.signal,
    detached: true,
  };
}

// ---------------------------------------------------------------------------
// Process launch
// ---------------------------------------------------------------------------

/**
 * Launch the codex app-server as a fully detached process and return its PID.
 *
 * Uses a small inline Node.js script as a launcher bridge so the app-server
 * child inherits `env` but is detached from ARIS stdio and process group.
 * The launcher writes the child PID to stdout; ARIS reads it and unrefs the
 * launcher before it exits.
 *
 * Throws if the launcher exits with a non-zero code or returns an invalid PID.
 */
export async function launchDetachedCodexAppServerProcess(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  args: string[];
  signal?: AbortSignal;
}): Promise<number> {
  const launcherScript = `
    const { spawn } = require('node:child_process');
    const command = process.argv[1];
    const args = JSON.parse(process.argv[2]);
    const cwd = process.argv[3];
    try {
      const child = spawn(command, args, {
        cwd,
        env: process.env,
        detached: true,
        stdio: 'ignore',
      });
      if (!child.pid || !Number.isInteger(child.pid) || child.pid <= 0) {
        console.error('missing detached codex app-server pid');
        process.exit(1);
      }
      console.log(String(child.pid));
      child.unref();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }
  `;

  const launcher = spawn(
    process.execPath,
    ['-e', launcherScript, 'codex', JSON.stringify(input.args), input.cwd],
    {
      cwd: input.cwd,
      env: input.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: input.signal,
    },
  );

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  launcher.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  });
  launcher.stderr?.on('data', (chunk: Buffer | string) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    launcher.once('error', reject);
    launcher.once('close', (code) => resolve(code));
  });

  if (exitCode !== 0) {
    const detail =
      stderrChunks.join('').trim()
      || stdoutChunks.join('').trim()
      || `exit code ${exitCode ?? 'null'}`;
    throw new Error(`failed to launch detached codex app-server: ${detail}`);
  }

  const pid = Number.parseInt(stdoutChunks.join('').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `failed to parse detached codex app-server pid: ${stdoutChunks.join('').trim()}`,
    );
  }
  return pid;
}

// ---------------------------------------------------------------------------
// Process termination
// ---------------------------------------------------------------------------

/**
 * Terminate the codex app-server process.
 *
 * Prefers killing the entire process group (`-pid`) so that any grandchild
 * processes spawned by codex are also terminated. Falls back to a direct
 * signal on the child handle if the process group no longer exists.
 */
export function terminateCodexAppServerProcess(
  child: { pid?: number; killed?: boolean; kill: (signal?: NodeJS.Signals | number) => boolean },
  killProcess: (pid: number, signal?: NodeJS.Signals | number) => void = process.kill,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  if (child.killed) {
    return;
  }

  const pid =
    typeof child.pid === 'number' && Number.isInteger(child.pid) && child.pid > 0
      ? child.pid
      : null;

  if (pid !== null) {
    try {
      killProcess(-pid, signal);
      return;
    } catch {
      // Fall back to the direct child signal if the process group no longer exists.
    }
  }

  child.kill(signal);
}

// ---------------------------------------------------------------------------
// Pending-request drain
// ---------------------------------------------------------------------------

/**
 * Reject all pending JSON-RPC requests with `reason` and clear the map.
 *
 * Called during abort or transport-close to avoid leaking unresolved
 * promises inside `runCodexAppServerWithEvents`.
 */
export function rejectCodexAppServerPendingRequests(
  pendingRequests: Map<string, { method: string; reject: (error: Error) => void }>,
  reason: string,
): void {
  for (const [key, pending] of pendingRequests.entries()) {
    pending.reject(new Error(reason));
    pendingRequests.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Abort promise
// ---------------------------------------------------------------------------

/**
 * Create a promise that resolves to `{ status: 'interrupted' }` when the
 * provided `AbortSignal` fires, and reject all pending JSON-RPC requests.
 *
 * Returns `interrupted: null` when no signal is provided (the caller handles
 * cancellation via other means, e.g. the `transportClosed` promise).
 *
 * `dispose()` must be called after the turn completes to remove the abort
 * listener and prevent memory leaks.
 */
export function createCodexAppServerAbortPromise(input: {
  signal?: AbortSignal;
  pendingRequests: Map<string, { method: string; reject: (error: Error) => void }>;
  onAbort: () => void;
}): {
  interrupted: Promise<{ status: 'interrupted' }> | null;
  dispose: () => void;
} {
  if (!input.signal) {
    return {
      interrupted: null,
      dispose: () => {},
    };
  }

  let disposed = false;
  let handleAbort: (() => void) | null = null;

  const finalizeAbort = (resolve: (value: { status: 'interrupted' }) => void) => {
    if (disposed) {
      return;
    }
    disposed = true;
    rejectCodexAppServerPendingRequests(input.pendingRequests, 'The operation was aborted');
    input.onAbort();
    resolve({ status: 'interrupted' });
  };

  const interrupted = new Promise<{ status: 'interrupted' }>((resolve) => {
    if (input.signal?.aborted) {
      finalizeAbort(resolve);
      return;
    }

    const abortListener = () => {
      input.signal?.removeEventListener('abort', abortListener);
      finalizeAbort(resolve);
    };
    handleAbort = abortListener;
    input.signal?.addEventListener('abort', abortListener, { once: true });
  });

  return {
    interrupted,
    dispose: () => {
      disposed = true;
      if (handleAbort) {
        input.signal?.removeEventListener('abort', handleAbort);
      }
    },
  };
}
