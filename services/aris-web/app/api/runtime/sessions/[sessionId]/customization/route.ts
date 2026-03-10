import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import {
  buildCustomizationOverview,
  readInstructionDoc,
  readSkillContent,
  writeInstructionDoc,
} from '@/lib/customization/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveSessionProjectPath(userId: string, sessionId: string): Promise<string> {
  const sessions = await listSessions(userId);
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) {
    throw new Error('워크스페이스 세션을 찾을 수 없습니다.');
  }
  return target.projectName;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { sessionId } = await context.params;
    const projectPath = await resolveSessionProjectPath(auth.user.id, sessionId);
    const url = new URL(request.url);
    const kind = (url.searchParams.get('kind') ?? '').trim();
    const id = (url.searchParams.get('id') ?? '').trim();

    if (!kind) {
      const overview = await buildCustomizationOverview(projectPath);
      return NextResponse.json(overview, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (kind === 'instruction') {
      const payload = await readInstructionDoc(projectPath, id);
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (kind === 'skill') {
      const payload = await readSkillContent(id);
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({ error: `Unsupported kind: ${kind}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Customization 정보를 불러오지 못했습니다.',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { sessionId } = await context.params;
    const projectPath = await resolveSessionProjectPath(auth.user.id, sessionId);
    const body = await request.json() as {
      kind?: string;
      id?: string;
      content?: string;
    };

    if (body.kind !== 'instruction') {
      return NextResponse.json({ error: 'Only instruction writes are supported' }, { status: 400 });
    }

    if (typeof body.id !== 'string' || !body.id.trim()) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const summary = await writeInstructionDoc(projectPath, body.id.trim(), body.content);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Customization 문서를 저장하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
