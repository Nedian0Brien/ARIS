import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions, createSession } from '@/lib/happy/client';
import { prisma } from '@/lib/db/prisma';

function normalizeProjectPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const sessions = await listSessions();

    // Fetch metadata for these sessions for this user
    const sessionIds = sessions.map(s => s.id);
    const metadatas = await prisma.sessionMetadata.findMany({
      where: {
        sessionId: { in: sessionIds },
        userId: auth.user.id
      }
    });

    const metadataMap = new Map(metadatas.map(m => [m.sessionId, m]));

    const mergedSessions = sessions.map(s => {
      const meta = metadataMap.get(s.id);
      return {
        ...s,
        alias: meta?.alias || null,
        isPinned: meta?.isPinned ?? false,
        lastReadAt: meta?.lastReadAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ sessions: mergedSessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sessions';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}


export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { path, agent, approvalPolicy } = body as {
      path?: string;
      agent?: string;
      approvalPolicy?: string;
    };
    const normalizedPolicy = approvalPolicy === 'on-request'
      || approvalPolicy === 'on-failure'
      || approvalPolicy === 'never'
      || approvalPolicy === 'yolo'
      ? approvalPolicy
      : 'on-request';
    const normalizedPath = typeof path === 'string' ? normalizeProjectPath(path) : '';

    const normalizedAgent = agent === 'claude' || agent === 'codex' || agent === 'gemini' ? agent : null;

    if (!normalizedPath || !normalizedAgent) {
      return NextResponse.json({ error: 'Path and agent are required' }, { status: 400 });
    }

    const existingSessions = await listSessions();
    const existing = existingSessions.find((session) => normalizeProjectPath(session.projectName) === normalizedPath);
    if (existing) {
      return NextResponse.json({ session: existing, reused: true });
    }

    const session = await createSession({ path: normalizedPath, agent: normalizedAgent, approvalPolicy: normalizedPolicy });
    return NextResponse.json({ session, reused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
