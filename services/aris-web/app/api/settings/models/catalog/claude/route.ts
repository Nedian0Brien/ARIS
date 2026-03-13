import { NextRequest, NextResponse } from 'next/server';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { decryptScopedSetting } from '@/lib/crypto/settings';
import {
  deriveClaudeModelFamily,
  deriveClaudeModelLabel,
  deriveClaudeModelTags,
  isClaudeModelId,
  type ClaudeCatalogItem,
} from '@/lib/settings/providerModels';

const CLAUDE_KEY_SALT = 'aris-claude-settings-v1';

type AnthropicModelApiItem = {
  id?: unknown;
  display_name?: unknown;
  created_at?: unknown;
  type?: unknown;
};

export async function GET(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const preference = await prisma.uiPreference.findUnique({
    where: { userId: auth.user.id },
    select: { claudeApiKeyEncrypted: true },
  });

  if (!preference?.claudeApiKeyEncrypted) {
    return NextResponse.json({ error: 'CLAUDE_API_KEY_NOT_CONFIGURED' }, { status: 400 });
  }

  let apiKey = '';
  try {
    apiKey = decryptScopedSetting(preference.claudeApiKeyEncrypted, CLAUDE_KEY_SALT);
  } catch (error) {
    console.error('Failed to decrypt Claude API key:', error);
    return NextResponse.json({ error: 'CLAUDE_API_KEY_DECRYPT_FAILED' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = typeof body?.error?.message === 'string'
        ? body.error.message
        : 'Claude 모델 목록을 불러오지 못했습니다.';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const payload = await response.json().catch(() => ({ data: [] }));
    const rawItems = Array.isArray(payload?.data) ? payload.data as AnthropicModelApiItem[] : [];

    const items: ClaudeCatalogItem[] = rawItems
      .map((item) => {
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const displayName = typeof item.display_name === 'string' ? item.display_name : undefined;
        const createdAt = typeof item.created_at === 'string' ? item.created_at : null;
        const created = createdAt ? Math.floor(new Date(createdAt).getTime() / 1000) : 0;

        if (!isClaudeModelId(id)) {
          return null;
        }

        return {
          id,
          family: deriveClaudeModelFamily(id),
          label: deriveClaudeModelLabel(id, displayName),
          created,
          createdAt,
          tags: deriveClaudeModelTags(id),
        } satisfies ClaudeCatalogItem;
      })
      .filter((item): item is ClaudeCatalogItem => Boolean(item))
      .sort((a, b) => {
        if (b.created !== a.created) {
          return b.created - a.created;
        }
        return a.id.localeCompare(b.id);
      });

    return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to load Claude catalog:', error);
    return NextResponse.json({ error: 'Claude 모델 목록 요청에 실패했습니다.' }, { status: 502 });
  }
}
