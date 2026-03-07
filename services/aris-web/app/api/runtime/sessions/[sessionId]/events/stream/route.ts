import { NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getSessionEvents, HappyHttpError } from '@/lib/happy/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STREAM_POLL_INTERVAL_MS = 900;
const HEARTBEAT_INTERVAL_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  const after = request.nextUrl.searchParams.get('after');
  let cursor = typeof after === 'string' && after.trim().length > 0 ? after.trim() : null;

  const encoder = new TextEncoder();
  let aborted = false;
  let lastHeartbeatAt = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writeEvent = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const closeSafely = () => {
        if (aborted) {
          return;
        }
        aborted = true;
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener('abort', closeSafely);
      writeEvent('ready', { sessionId, now: new Date().toISOString() });

      void (async () => {
        while (!aborted) {
          try {
            if (!cursor) {
              const { events } = await getSessionEvents(sessionId, {
                userId: auth.user.id,
                limit: 1,
              });
              cursor = events[events.length - 1]?.id ?? null;
            } else {
              const { events } = await getSessionEvents(sessionId, {
                userId: auth.user.id,
                after: cursor,
              });
              for (const event of events) {
                writeEvent('event', { event });
                cursor = event.id;
              }
            }

            const now = Date.now();
            if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
              writeEvent('heartbeat', { now: new Date(now).toISOString() });
              lastHeartbeatAt = now;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to stream events';
            // Avoid colliding with native EventSource "error" events.
            if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
              writeEvent('stream_error', { message, status: error.status });
              closeSafely();
              return;
            }
            writeEvent('stream_error', { message });
          }

          await sleep(STREAM_POLL_INTERVAL_MS);
        }
      })();
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
