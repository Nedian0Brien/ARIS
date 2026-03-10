import { NextRequest, NextResponse } from 'next/server';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { decryptScopedSetting } from '@/lib/crypto/settings';
import {
  deriveOpenAiModelFamily,
  deriveOpenAiModelLabel,
  deriveOpenAiModelTags,
  isOpenAiTextGenerationModelId,
  type OpenAiCatalogItem,
} from '@/lib/settings/providerModels';

const OPENAI_KEY_SALT = 'aris-openai-settings-v1';

type OpenAiModelApiItem = {
  id?: unknown;
  created?: unknown;
};

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

  let apiKey = '';
  try {
    apiKey = decryptScopedSetting(preference.openAiApiKeyEncrypted, OPENAI_KEY_SALT);
  } catch (error) {
    console.error('Failed to decrypt OpenAI API key:', error);
    return NextResponse.json({ error: 'OPENAI_API_KEY_DECRYPT_FAILED' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = typeof body?.error?.message === 'string'
        ? body.error.message
        : 'OpenAI 모델 목록을 불러오지 못했습니다.';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const payload = await response.json().catch(() => ({ data: [] }));
    const rawItems = Array.isArray(payload?.data) ? payload.data as OpenAiModelApiItem[] : [];
    const items: OpenAiCatalogItem[] = rawItems
      .map((item) => {
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const created = typeof item.created === 'number' && Number.isFinite(item.created) ? item.created : 0;
        if (!isOpenAiTextGenerationModelId(id)) {
          return null;
        }
        return {
          id,
          family: deriveOpenAiModelFamily(id),
          label: deriveOpenAiModelLabel(id),
          created,
          createdAt: created > 0 ? new Date(created * 1000).toISOString() : null,
          tags: deriveOpenAiModelTags(id),
        } satisfies OpenAiCatalogItem;
      })
      .filter((item): item is OpenAiCatalogItem => Boolean(item))
      .sort((a, b) => {
        if (b.created !== a.created) {
          return b.created - a.created;
        }
        return a.id.localeCompare(b.id);
      });

    return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to load OpenAI catalog:', error);
    return NextResponse.json({ error: 'OpenAI 모델 목록 요청에 실패했습니다.' }, { status: 502 });
  }
}
