/**
 * Codex app-server WebSocket client — pure connection utilities.
 *
 * Handles port reservation, socket construction, connection with retry,
 * and message-data normalisation for the codex `app-server` channel.
 *
 * The app-server is a detached Node process spawned by
 * `codexAppServerLifecycle.ts`. Once it is listening the caller obtains a
 * URL from `buildCodexAppServerListenUrl`, then calls
 * `connectCodexAppServerSocket` to establish the WebSocket session.
 *
 * Used by `runCodexAppServer` for the app-server transport.
 */

import { createServer } from 'node:net';

// ---------------------------------------------------------------------------
// Socket interface (structural — works with both browser and ws package)
// ---------------------------------------------------------------------------

export type CodexAppServerSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  addEventListener(type: 'close', listener: () => void): void;
  removeEventListener(type: 'open', listener: () => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'error', listener: (event: unknown) => void): void;
  removeEventListener(type: 'close', listener: () => void): void;
};

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/** Build the WebSocket listen URL for a given port. */
export function buildCodexAppServerListenUrl(port: number): string {
  return `ws://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------------------
// Port reservation
// ---------------------------------------------------------------------------

/**
 * Reserve an ephemeral localhost port by briefly listening on port 0.
 *
 * The port is freed before this resolves, so there is a small TOCTOU window.
 * In practice codex app-server connects immediately, so the window is
 * negligible on loopback.
 */
export async function reserveCodexAppServerPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to reserve codex app-server websocket port'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.unref?.();
  });
}

// ---------------------------------------------------------------------------
// Socket construction
// ---------------------------------------------------------------------------

function createCodexAppServerSocket(url: string): CodexAppServerSocket {
  const WebSocketCtor = (
    globalThis as { WebSocket?: new (url: string) => CodexAppServerSocket }
  ).WebSocket;
  if (typeof WebSocketCtor !== 'function') {
    throw new Error('global WebSocket constructor is unavailable');
  }
  return new WebSocketCtor(url);
}

// ---------------------------------------------------------------------------
// Connection with retry
// ---------------------------------------------------------------------------

/**
 * Connect to the codex app-server WebSocket, retrying until `timeoutMs`
 * expires (default 5 000 ms).
 *
 * Each attempt uses a per-attempt 750 ms timeout so the outer deadline is
 * consumed in ~6-7 attempts, giving the app-server time to bind after
 * `launchDetachedCodexAppServerProcess` returns.
 */
export async function connectCodexAppServerSocket(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<CodexAppServerSocket> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new Error('codex app-server websocket connection aborted');
    }

    try {
      const socket = await new Promise<CodexAppServerSocket>((resolve, reject) => {
        const candidate = createCodexAppServerSocket(url);
        let settled = false;

        const cleanup = () => {
          candidate.removeEventListener('open', handleOpen);
          candidate.removeEventListener('error', handleError);
          candidate.removeEventListener('close', handleClose);
          options.signal?.removeEventListener('abort', handleAbort);
          clearTimeout(timer);
        };

        const finishResolve = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(candidate);
        };

        const finishReject = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          try {
            candidate.close();
          } catch {
            // ignore close failures while cleaning up failed attempts
          }
          reject(error);
        };

        const handleOpen = () => finishResolve();
        const handleError = () =>
          finishReject(new Error('codex app-server websocket connection failed'));
        const handleClose = () =>
          finishReject(new Error('codex app-server websocket closed before opening'));
        const handleAbort = () =>
          finishReject(new Error('codex app-server websocket connection aborted'));
        const timer = setTimeout(
          () =>
            finishReject(new Error('timed out waiting for codex app-server websocket')),
          750,
        );

        candidate.addEventListener('open', handleOpen);
        candidate.addEventListener('error', handleError);
        candidate.addEventListener('close', handleClose);
        options.signal?.addEventListener('abort', handleAbort, { once: true });
      });
      return socket;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (Date.now() >= deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw lastError ?? new Error('failed to connect to codex app-server websocket');
}

// ---------------------------------------------------------------------------
// Message data normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise the raw WebSocket `message.data` value to a UTF-8 string
 * regardless of whether the payload arrived as a string, ArrayBuffer, or
 * ArrayBufferView (e.g. Node.js `ws` Buffer).
 */
export function normalizeCodexAppServerMessageData(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data ?? '');
}
