import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import {
  getProjectEvents,
  appendProjectMessage,
  submitUserPrompt,
  HappyHttpError,
  getImportedAgentProjectState,
  importOlderAgentTranscript,
  importLatestAgentTranscript,
} from '@/lib/happy/client';
import { prisma } from '@/lib/db/prisma';
import {
  normalizeSupportedAgent,
  resolveRuntimeMessageModel,
} from '@/lib/happy/modelPolicy';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';
import { readChatImageAttachments } from '@/lib/chatImageAttachments';
import { getHostHomeDir } from '@/lib/fs/pathResolver';
import { ensureProjectWorkspacePanelRuntimes } from '@/lib/happy/workspacePanelRuntimes';
import {
  readWorkspacePanelIdFromRecord,
  resolveWorkspacePanelExecutionTarget,
  type WorkspacePanelExecutionTarget,
  WorkspacePanelExecutionTargetError,
} from '@/lib/workspacePanels/executionTarget';

const CHAT_IMAGE_ASSET_ROOT = path.join(getHostHomeDir(), '.aris', 'chat-assets');

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

function normalizeProjectSegment(projectId: string): string | null {
  const trimmed = projectId.trim();
  if (!trimmed || !/^[A-Za-z0-9._-]+$/.test(trimmed) || trimmed === '.' || trimmed === '..') {
    return null;
  }
  return trimmed;
}

function normalizeImageAttachments(projectId: string, meta: Record<string, unknown>) {
  const projectSegment = normalizeProjectSegment(projectId);
  if (!projectSegment) {
    return [];
  }
  const projectRoot = path.resolve(path.join(CHAT_IMAGE_ASSET_ROOT, projectSegment));
  return readChatImageAttachments(meta).flatMap((attachment) => {
    const resolvedPath = path.resolve(attachment.serverPath);
    if (!(resolvedPath === projectRoot || resolvedPath.startsWith(`${projectRoot}${path.sep}`))) {
      return [];
    }
    return [{
      ...attachment,
      serverPath: resolvedPath,
      previewUrl: `/api/runtime/projects/${encodeURIComponent(projectSegment)}/assets/images?path=${encodeURIComponent(resolvedPath)}`,
    }];
  });
}

function workspacePanelTargetErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WorkspacePanelExecutionTargetError)) return null;
  if (error.code === 'PROJECT_NOT_FOUND') {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ error: '워크스페이스 패널을 찾을 수 없습니다.' }, { status: 404 });
}

async function resolveWorkspacePanelExecutionTargetWithRuntime(input: {
  userId: string;
  projectId: string;
  workspacePanelId: string | null;
}): Promise<WorkspacePanelExecutionTarget | null> {
  if (!input.workspacePanelId) return null;
  let target = await resolveWorkspacePanelExecutionTarget(input);
  if (target.source === 'workspace-panel' && target.runtimeProjectId === input.projectId) {
    const panelRuntimeErrors = await ensureProjectWorkspacePanelRuntimes({
      userId: input.userId,
      projectId: input.projectId,
    });
    if (panelRuntimeErrors[input.workspacePanelId]) {
      throw new Error(`runtime 생성 실패: ${panelRuntimeErrors[input.workspacePanelId]}`);
    }
    target = await resolveWorkspacePanelExecutionTarget(input);
  }
  return target;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { projectId } = await params;
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
    const importState = chatId ? await getImportedAgentProjectState(chatId) : null;
    if (chatId && !before && !after && importState) {
      await importLatestAgentTranscript(chatId);
    }
    if (chatId && before && importState?.hasMoreBefore === true) {
      await importOlderAgentTranscript(chatId, { limitTurns: 3 });
    }
    const { events, page } = await getProjectEvents(projectId, {
      userId: auth.user.id,
      before,
      after,
      limit,
      chatId,
      includeUnassigned,
    });
    const pageWithImportState = chatId && !before && !after && importState?.hasMoreBefore === true
      ? { ...page, hasMoreBefore: true }
      : page;
    return NextResponse.json({ events, page: pageWithImportState });
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
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { projectId } = await params;
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
        ? await prisma.chat.findFirst({
            where: { id: chatId, projectId: projectId },
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
        projectModel: chat?.model,
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
      const attachments = normalizeImageAttachments(projectId, meta);
      if (attachments.length > 0) {
        meta.attachments = attachments;
      } else {
        delete meta.attachments;
      }
      meta.modelValidation = {
        source: resolved.source,
        ...(resolved.fallbackReason ? { fallbackReason: resolved.fallbackReason } : {}),
        ...(resolved.requestedModel ? { requestedModel: resolved.requestedModel } : {}),
      };

      if (chatId && chat && chat.agent !== resolved.agent) {
        await prisma.chat.update({
          where: { id: chatId },
          data: { agent: resolved.agent, model: resolved.model },
        });
        const previousAgent = chat.agent;
        const isKnownPreviousAgent = previousAgent === 'codex'
          || previousAgent === 'claude'
          || previousAgent === 'gemini';
        if (isKnownPreviousAgent) {
          try {
            await appendProjectMessage({
              projectId,
              type: 'message',
              title: '에이전트 변경',
              text: `이 채팅의 에이전트가 ${previousAgent} → ${resolved.agent}로 변경되었습니다.`,
              meta: {
                chatId,
                role: 'agent',
                streamEvent: 'agent_switched',
                fromAgent: previousAgent,
                toAgent: resolved.agent,
              },
            });
          } catch {
            // 알림 이벤트 적재 실패는 사용자 메시지 전송을 막지 않는다.
          }
        }
      }
    }

    const workspacePanelId = readWorkspacePanelIdFromRecord(meta);
    const target = await resolveWorkspacePanelExecutionTargetWithRuntime({
      userId: auth.user.id,
      projectId: projectId,
      workspacePanelId,
    });
    if (target && target.runtimeProjectId !== projectId) {
      meta.runtimeProjectId = target.runtimeProjectId;
      meta.workspacePanelId = target.workspacePanelId;
    }

    const event = role === 'user' && type === 'message'
      ? await submitUserPrompt({
          projectId,
          runtimeProjectId: target?.runtimeProjectId === projectId ? undefined : target?.runtimeProjectId,
          title: body.title,
          text: body.text,
          meta,
        })
      : await appendProjectMessage({
          projectId,
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
    const response = workspacePanelTargetErrorResponse(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Failed to send message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
