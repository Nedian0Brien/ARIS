import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getSessionEvents, appendSessionMessage, HappyHttpError } from '@/lib/happy/client';
import { prisma } from '@/lib/db/prisma';
import {
  normalizeSupportedAgent,
  resolveRuntimeMessageModel,
} from '@/lib/happy/modelPolicy';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';

function toMetaRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function normalizeModelReasoningEffort(value: unknown): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }
  return undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  const beforeRaw = request.nextUrl.searchParams.get('before');
  const afterRaw = request.nextUrl.searchParams.get('after');
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const chatIdRaw = request.nextUrl.searchParams.get('chatId');
  const includeUnassignedRaw = request.nextUrl.searchParams.get('includeUnassigned');
  const before = typeof beforeRaw === 'string' && beforeRaw.trim().length > 0 ? beforeRaw.trim() : undefined;
  const after = typeof afterRaw === 'string' && afterRaw.trim().length > 0 ? afterRaw.trim() : undefined;
  const limit = typeof limitRaw === 'string' && limitRaw.trim().length > 0 ? Number(limitRaw) : undefined;
  const chatId = typeof chatIdRaw === 'string' && chatIdRaw.trim().length > 0 ? chatIdRaw.trim() : undefined;
  const includeUnassigned = includeUnassignedRaw === '1' || includeUnassignedRaw === 'true';

  if (before && after) {
    return NextResponse.json({ error: 'before와 after를 동시에 사용할 수 없습니다.' }, { status: 400 });
  }

  try {
    const { events, page } = await getSessionEvents(sessionId, {
      userId: auth.user.id,
      before,
      after,
      limit,
      chatId,
      includeUnassigned,
    });
    return NextResponse.json({ events, page });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;
  try {
    const body = await request.json();
    const type = body?.type === 'tool' || body?.type === 'read' || body?.type === 'write' || body?.type === 'message'
      ? body.type
      : 'message';
    const meta = toMetaRecord(body?.meta);
    const role = meta.role === 'agent' ? 'agent' : 'user';

    if (role === 'user' && type === 'message') {
      const chatId = typeof meta.chatId === 'string' && meta.chatId.trim().length > 0 ? meta.chatId.trim() : undefined;
      const chat = chatId
        ? await prisma.sessionChat.findFirst({
            where: { id: chatId, sessionId },
            select: { agent: true, model: true, geminiMode: true },
          })
        : null;
      const requestedAgent = normalizeSupportedAgent(meta.agent, normalizeSupportedAgent(chat?.agent, 'codex'));
      const settings = await getUserModelSettings(auth.user.id);
      const selectedCustomModels = settings.providers[requestedAgent].selectedModelIds;
      const legacyCustomModel = settings.legacyCustomModels[requestedAgent];
      const resolved = resolveRuntimeMessageModel({
        agent: requestedAgent,
        requestedModel: meta.model,
        sessionModel: chat?.model,
        customModel: legacyCustomModel,
        customModels: selectedCustomModels,
      });
      meta.agent = resolved.agent;
      meta.model = resolved.model;
      if (requestedAgent === 'gemini') {
        const explicitGeminiMode = typeof meta.geminiMode === 'string' && meta.geminiMode.trim().length > 0
          ? meta.geminiMode.trim()
          : null;
        const storedGeminiMode = typeof chat?.geminiMode === 'string' && chat.geminiMode.trim().length > 0
          ? chat.geminiMode.trim()
          : null;
        if (explicitGeminiMode || storedGeminiMode) {
          meta.geminiMode = explicitGeminiMode ?? storedGeminiMode;
        }
      }
      const reasoningEffort = normalizeModelReasoningEffort(
        meta.modelReasoningEffort ?? meta.model_reasoning_effort,
      );
      if (reasoningEffort) {
        meta.modelReasoningEffort = reasoningEffort;
        meta.model_reasoning_effort = reasoningEffort;
      } else {
        delete meta.modelReasoningEffort;
        delete meta.model_reasoning_effort;
      }
      if (resolved.customModel) {
        meta.customModel = resolved.customModel;
      }
      meta.modelValidation = {
        source: resolved.source,
        ...(resolved.fallbackReason ? { fallbackReason: resolved.fallbackReason } : {}),
        ...(resolved.requestedModel ? { requestedModel: resolved.requestedModel } : {}),
      };
    }

    const event = await appendSessionMessage({
      sessionId,
      type,
      title: body.title,
      text: body.text,
      meta,
    });
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to send message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
