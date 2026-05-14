import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listKnowledgeAssets } from '@/lib/ask/knowledge';
import type { KnowledgeAssetKind, KnowledgeAssetStatus } from '@/lib/ask/knowledge';

function normalizeStatus(value: string | null): KnowledgeAssetStatus | 'all' | undefined {
  if (value === 'candidate' || value === 'confirmed' || value === 'dismissed' || value === 'all') return value;
  return undefined;
}

function normalizeKind(value: string | null): KnowledgeAssetKind | 'all' | undefined {
  if (
    value === 'decision'
    || value === 'task_outcome'
    || value === 'command_recipe'
    || value === 'debug_case'
    || value === 'deployment_record'
    || value === 'project_memory'
    || value === 'user_preference'
    || value === 'external_note'
    || value === 'all'
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const assets = await listKnowledgeAssets({
    userId: auth.user.id,
    query: request.nextUrl.searchParams.get('q') ?? '',
    status: normalizeStatus(request.nextUrl.searchParams.get('status')) ?? 'all',
    kind: normalizeKind(request.nextUrl.searchParams.get('kind')) ?? 'all',
    limit: Number(request.nextUrl.searchParams.get('limit') ?? '40'),
  });

  return NextResponse.json({ assets });
}
