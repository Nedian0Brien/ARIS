import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { updateKnowledgeAsset } from '@/lib/ask/knowledge';
import type { KnowledgeAssetStatus } from '@/lib/ask/knowledge';

function normalizeStatus(value: unknown): KnowledgeAssetStatus | undefined {
  if (value === 'candidate' || value === 'confirmed' || value === 'dismissed') return value;
  return undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { assetId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
    title?: unknown;
    summary?: unknown;
    body?: unknown;
    tags?: unknown;
  };
  const asset = await updateKnowledgeAsset({
    userId: auth.user.id,
    assetId,
    status: normalizeStatus(body.status),
    title: typeof body.title === 'string' ? body.title : undefined,
    summary: typeof body.summary === 'string' ? body.summary : undefined,
    body: typeof body.body === 'string' ? body.body : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
  });

  if (!asset) {
    return NextResponse.json({ error: 'Knowledge asset을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ asset });
}
