import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { searchExternalSources } from '@/lib/ask/externalSearch';
import { getProjectCandidates, listKnowledgeAssets } from '@/lib/ask/knowledge';
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

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const status = normalizeStatus(request.nextUrl.searchParams.get('status'));
  const kind = normalizeKind(request.nextUrl.searchParams.get('kind'));
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20');

  const [results, externalResults, projectCandidates] = await Promise.all([
    listKnowledgeAssets({
      userId: auth.user.id,
      query,
      status: status ?? 'all',
      kind: kind ?? 'all',
      limit: Number.isFinite(limit) ? limit : 20,
    }),
    searchExternalSources(query),
    getProjectCandidates(auth.user.id, query),
  ]);

  return NextResponse.json({
    query,
    results,
    externalResults,
    projectCandidates,
    sourceTypes: ['aris-memory', 'external-search', 'inference'],
  });
}
