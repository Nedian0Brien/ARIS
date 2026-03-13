import { NextRequest, NextResponse } from 'next/server';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { decryptScopedSetting } from '@/lib/crypto/settings';
import {
  DEFAULT_GEMINI_MODEL_SELECTIONS,
  deriveGeminiModelFamily,
  deriveGeminiModelLabel,
  deriveGeminiModelTags,
  isAllowedGeminiSelectionModelId,
  type GeminiCatalogItem,
} from '@/lib/settings/providerModels';

const GEMINI_KEY_SALT = 'aris-gemini-settings-v1';

type GoogleModelApiItem = {
  name?: unknown;
  baseModelId?: unknown;
  displayName?: unknown;
  supportedGenerationMethods?: unknown;
};

type GoogleModelListPayload = {
  models?: unknown;
  nextPageToken?: unknown;
};

type GeminiPreferenceRecord = {
  geminiApiKeyEncrypted: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const preference = await prisma.uiPreference.findUnique({
    where: { userId: auth.user.id },
    select: { geminiApiKeyEncrypted: true } as never,
  }) as GeminiPreferenceRecord | null;

  if (!preference?.geminiApiKeyEncrypted) {
    return NextResponse.json({ error: 'GEMINI_API_KEY_NOT_CONFIGURED' }, { status: 400 });
  }

  let apiKey = '';
  try {
    apiKey = decryptScopedSetting(preference.geminiApiKeyEncrypted, GEMINI_KEY_SALT);
  } catch (error) {
    console.error('Failed to decrypt Gemini API key:', error);
    return NextResponse.json({ error: 'GEMINI_API_KEY_DECRYPT_FAILED' }, { status: 500 });
  }

  try {
    const itemsById = new Map<string, GeminiCatalogItem>();
    for (const id of DEFAULT_GEMINI_MODEL_SELECTIONS) {
      if (!isAllowedGeminiSelectionModelId(id)) {
        continue;
      }
      itemsById.set(id, {
        id,
        family: deriveGeminiModelFamily(id),
        label: deriveGeminiModelLabel(id),
        created: 0,
        createdAt: null,
        tags: deriveGeminiModelTags(id),
      } satisfies GeminiCatalogItem);
    }
    let nextPageToken: string | null = null;

    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '1000');
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body?.error?.message === 'string'
          ? body.error.message
          : 'Gemini 모델 목록을 불러오지 못했습니다.';
        return NextResponse.json({ error: message }, { status: response.status });
      }

      const payload = await response.json().catch(() => ({ models: [] })) as GoogleModelListPayload;
      const rawItems = Array.isArray(payload.models) ? payload.models as GoogleModelApiItem[] : [];

      for (const item of rawItems) {
        const rawName = typeof item.name === 'string' ? item.name.trim() : '';
        const baseModelId = typeof item.baseModelId === 'string' ? item.baseModelId.trim() : '';
        const id = baseModelId || rawName.replace(/^models\//, '');
        const displayName = typeof item.displayName === 'string' ? item.displayName : undefined;

        if (!isAllowedGeminiSelectionModelId(id)) {
          continue;
        }

        const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
        if (!methods.includes('generateContent')) {
          continue;
        }

        if (itemsById.has(id)) {
          continue;
        }

        itemsById.set(id, {
          id,
          family: deriveGeminiModelFamily(id),
          label: deriveGeminiModelLabel(id, displayName),
          created: 0,
          createdAt: null,
          tags: deriveGeminiModelTags(id),
        } satisfies GeminiCatalogItem);
      }

      nextPageToken = typeof payload.nextPageToken === 'string' && payload.nextPageToken.trim().length > 0
        ? payload.nextPageToken.trim()
        : null;
    } while (nextPageToken);

    const items = Array.from(itemsById.values()).sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to load Gemini catalog:', error);
    return NextResponse.json({ error: 'Gemini 모델 목록 요청에 실패했습니다.' }, { status: 502 });
  }
}
