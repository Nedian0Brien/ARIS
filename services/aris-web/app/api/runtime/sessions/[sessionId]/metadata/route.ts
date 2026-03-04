import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/runtime/sessions/[sessionId]/metadata
 * 세션의 이름(alias) 및 상단 고정(isPinned) 상태를 DB에 저장합니다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  // 관찰자(viewer)도 자신의 UI 설정을 변경할 수는 있게 하되, 
  // 필요하다면 operator 권한 체크를 추가할 수 있습니다.
  const { sessionId } = await params;
  
  try {
    const body = await request.json();
    const { alias, isPinned } = body;

    const metadata = await prisma.sessionMetadata.upsert({
      where: {
        sessionId_userId: { sessionId, userId: auth.user.id },
      },
      update: {
        ...(alias !== undefined && { alias }),
        ...(isPinned !== undefined && { isPinned }),
      },
      create: {
        sessionId,
        userId: auth.user.id,
        alias: alias || null,
        isPinned: isPinned || false,
      },
    });

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('Metadata update error:', error);
    return NextResponse.json({ error: '세션 메타데이터 저장에 실패했습니다.' }, { status: 500 });
  }
}
