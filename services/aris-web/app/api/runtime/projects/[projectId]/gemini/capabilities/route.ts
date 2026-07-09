import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getGeminiProjectCapabilities, HappyHttpError } from '@/lib/happy/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId } = await params;
    const capabilities = await getGeminiProjectCapabilities(projectId);
    return NextResponse.json({ capabilities });
  } catch (error) {
    if (error instanceof HappyHttpError && [400, 401, 403, 404, 502].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Gemini capability 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
