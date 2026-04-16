import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { buildLocalPreviewUrl, parseLocalPreviewPort } from '@/lib/preview/localPreviewProxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; panelId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId, panelId } = await params;
  const port = parseLocalPreviewPort(request.nextUrl.searchParams.get('port'));
  if (port === null) {
    return NextResponse.json({ error: '유효한 포트 번호가 필요합니다.' }, { status: 400 });
  }

  const previewUrl = buildLocalPreviewUrl({
    sessionId,
    panelId,
    port,
    path: request.nextUrl.searchParams.get('path'),
  });

  return NextResponse.json({ previewUrl });
}
