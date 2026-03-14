import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getGeminiSessionCapabilities, HappyHttpError } from '@/lib/happy/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { sessionId } = await params;
    const capabilities = await getGeminiSessionCapabilities(sessionId);
    return NextResponse.json({ capabilities });
  } catch (error) {
    if (error instanceof HappyHttpError && [400, 401, 403, 404, 502].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Gemini capability 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
