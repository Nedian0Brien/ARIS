import { NextRequest, NextResponse } from 'next/server';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { OpenAiCatalogError, loadOpenAiCatalogItems } from '@/lib/settings/openAiCatalog';

export async function GET(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const preference = await prisma.uiPreference.findUnique({
    where: { userId: auth.user.id },
    select: { openAiApiKeyEncrypted: true },
  });

  if (!preference?.openAiApiKeyEncrypted) {
    return NextResponse.json({ error: 'OPENAI_API_KEY_NOT_CONFIGURED' }, { status: 400 });
  }

  try {
    const items = await loadOpenAiCatalogItems(preference.openAiApiKeyEncrypted);
    return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof OpenAiCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to load OpenAI catalog:', error);
    return NextResponse.json({ error: 'OpenAI 모델 목록 요청에 실패했습니다.' }, { status: 502 });
  }
}
