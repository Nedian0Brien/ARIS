import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type KnowledgeAssetKind =
  | 'decision'
  | 'task_outcome'
  | 'command_recipe'
  | 'debug_case'
  | 'deployment_record'
  | 'project_memory'
  | 'user_preference'
  | 'external_note';

export type KnowledgeAssetStatus = 'candidate' | 'confirmed' | 'dismissed';
export type KnowledgeAssetScope = 'global' | 'project' | 'chat';
export type KnowledgeSensitivity = 'normal' | 'redacted' | 'sensitive';
export type KnowledgeSourceType = 'session_chat_event' | 'session_run' | 'chat' | 'project' | 'external';

export type KnowledgeSourceRefInput = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  projectId?: string | null;
  chatId?: string | null;
  runId?: string | null;
  eventSeq?: number | null;
  label?: string | null;
  snippet?: string | null;
};

export type ExtractableChatEvent = {
  id: string;
  sessionId: string;
  chatId: string;
  runId?: string | null;
  type: string;
  title?: string | null;
  text: string;
  meta?: unknown;
  seq: number;
  createdAt: Date;
};

export type KnowledgeAssetCandidate = {
  userId: string;
  kind: KnowledgeAssetKind;
  title: string;
  summary: string;
  body: string;
  status: KnowledgeAssetStatus;
  scope: KnowledgeAssetScope;
  projectId: string | null;
  chatId: string | null;
  runId: string | null;
  confidence: number;
  sensitivity: KnowledgeSensitivity;
  tags: string[];
  dedupeKey: string;
  sourceRefs: KnowledgeSourceRefInput[];
};

export type KnowledgeSearchResult = {
  id: string;
  kind: KnowledgeAssetKind;
  status: KnowledgeAssetStatus;
  title: string;
  summary: string;
  body: string;
  scope: KnowledgeAssetScope;
  projectId: string | null;
  chatId: string | null;
  runId: string | null;
  confidence: number;
  sensitivity: KnowledgeSensitivity;
  tags: string[];
  updatedAt: string;
  sourceRefs: KnowledgeSourceRefInput[];
  score: number;
};

export type ExternalSearchResult = {
  title: string;
  url?: string;
  snippet: string;
  sourceType: 'external_search';
};

export type ProjectCandidate = {
  projectId: string;
  projectName: string;
  lastActivityAt: string | null;
};

export type AskAnswerDraft = {
  intent: 'memory_answer' | 'project_handoff';
  content: string;
  sections: {
    arisMemory: string;
    externalSearch: string;
    inference: string;
  };
  citations: KnowledgeSourceRefInput[];
  suggestedProjects: ProjectCandidate[];
};

type KnowledgeAssetWithRefs = Prisma.KnowledgeAssetGetPayload<{
  include: { sourceRefs: true };
}>;

const EXECUTION_REQUEST_PATTERN = /(구현|수정|배포|커밋|푸쉬|push|PR|이슈\s*생성|명령.*실행|실행해|코드.*바꿔|테스트.*돌려|merge|deploy|commit)/i;
const COMMAND_PATTERN = /(^|\n)\s*(npm|pnpm|yarn|bun|git|gh|curl|docker|pm2|pytest|vitest|tsc|DEPLOY_ENV_FILE=|WEB_DEV_AUTO_PORT=|sudo)\b|명령어|command|terminal/i;
const DEPLOY_PATTERN = /(배포|deploy|rollback|blue\/green|zero.?downtime|production|dev proxy|proxy\/\d+)/i;
const DEBUG_PATTERN = /(원인|해결|증상|실패|오류|에러|failed|failure|root cause|debug|stale|regression)/i;
const DECISION_PATTERN = /(결정|하기로|정책|기준|선택|확정|assumption|recommended|default|유도하기로|금지|허용)/i;
const PREFERENCE_PATTERN = /(반드시|항상|앞으로|선호|하지 않는다|하지 마|원해|기본값|default로|우선시)/i;
const OUTCOME_PATTERN = /(완료|검증|통과|passed|후속|남은 작업|작업 결과|fixed|shipped|merged)/i;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function truncate(input: string, maxLength: number): string {
  const trimmed = normalizeWhitespace(input);
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function metaRole(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).role;
  return typeof value === 'string' ? value : null;
}

function fingerprint(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex');
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PWD)[A-Z0-9_]*)\s*=\s*(['"]?)[^\s'"\n]+(['"]?)/g, '$1=[REDACTED]')
    .replace(/\b(password|passwd|secret|token|api[_-]?key)\s*:\s*(['"]?)[^\s'"\n]+(['"]?)/gi, '$1: [REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, '[REDACTED]');
}

function classifyEvent(event: ExtractableChatEvent): KnowledgeAssetKind | null {
  const text = `${event.title ?? ''}\n${event.text}`;
  if (COMMAND_PATTERN.test(text) || /execution$/.test(event.type)) return 'command_recipe';
  if (metaRole(event.meta) === 'user' && DECISION_PATTERN.test(text)) return 'decision';
  if (DEPLOY_PATTERN.test(text)) return 'deployment_record';
  if (DEBUG_PATTERN.test(text)) return 'debug_case';
  if (metaRole(event.meta) === 'user' && PREFERENCE_PATTERN.test(text)) return 'user_preference';
  if (DECISION_PATTERN.test(text)) return 'decision';
  if (OUTCOME_PATTERN.test(text)) return 'task_outcome';
  if (/file_(read|write|list)|project|workspace/i.test(event.type)) return 'project_memory';
  return null;
}

function tagsFor(kind: KnowledgeAssetKind, event: ExtractableChatEvent): string[] {
  const tags = new Set<string>([kind.replace('_', '-')]);
  if (event.type) tags.add(event.type.replace('_', '-'));
  const role = metaRole(event.meta);
  if (role) tags.add(role);
  if (event.runId) tags.add('run-linked');
  return Array.from(tags).slice(0, 8);
}

function titleFor(kind: KnowledgeAssetKind, event: ExtractableChatEvent, body: string): string {
  const prefix: Record<KnowledgeAssetKind, string> = {
    decision: '결정',
    task_outcome: '작업 결과',
    command_recipe: '명령어',
    debug_case: '디버깅 사례',
    deployment_record: '배포 기록',
    project_memory: '프로젝트 기억',
    user_preference: '사용자 선호',
    external_note: '외부 참고',
  };
  const title = event.title && event.title !== event.type ? event.title : body;
  return truncate(`${prefix[kind]} · ${title}`, 96);
}

function confidenceFor(kind: KnowledgeAssetKind, event: ExtractableChatEvent): number {
  if (kind === 'deployment_record' || kind === 'command_recipe') return 0.82;
  if (kind === 'decision' && metaRole(event.meta) === 'user') return 0.78;
  if (kind === 'debug_case') return 0.74;
  return 0.64;
}

export function extractKnowledgeAssetsFromEvents(input: {
  userId: string;
  projectId: string | null;
  chatId: string | null;
  events: ExtractableChatEvent[];
}): KnowledgeAssetCandidate[] {
  const candidates: KnowledgeAssetCandidate[] = [];

  for (const event of input.events) {
    const kind = classifyEvent(event);
    if (!kind) continue;

    const raw = event.text.trim();
    const body = redactSensitiveText(raw);
    if (normalizeWhitespace(body).length < 24) continue;

    const sensitivity: KnowledgeSensitivity = body === raw ? 'normal' : 'redacted';
    const summary = truncate(body, 220);
    const projectId = input.projectId ?? event.sessionId ?? null;
    const chatId = input.chatId ?? event.chatId ?? null;
    const runId = event.runId ?? null;
    const dedupeKey = fingerprint([input.userId, kind, event.id, chatId, runId]);

    candidates.push({
      userId: input.userId,
      kind,
      title: titleFor(kind, event, body),
      summary,
      body,
      status: 'candidate',
      scope: chatId ? 'chat' : projectId ? 'project' : 'global',
      projectId,
      chatId,
      runId,
      confidence: confidenceFor(kind, event),
      sensitivity,
      tags: tagsFor(kind, event),
      dedupeKey,
      sourceRefs: [
        {
          sourceType: 'session_chat_event',
          sourceId: event.id,
          projectId,
          chatId,
          runId,
          eventSeq: event.seq,
          label: event.title ?? event.type,
          snippet: truncate(body, 180),
        },
      ],
    });
  }

  return candidates;
}

function toSearchResult(record: KnowledgeAssetWithRefs, queryTerms: string[] = []): KnowledgeSearchResult {
  const sourceRefs = Array.isArray(record.sourceRefs)
    ? record.sourceRefs.map((ref) => ({
        sourceType: ref.sourceType,
        sourceId: ref.sourceId,
        projectId: ref.projectId ?? null,
        chatId: ref.chatId ?? null,
        runId: ref.runId ?? null,
        eventSeq: ref.eventSeq ?? null,
        label: ref.label ?? null,
        snippet: ref.snippet ?? null,
      }))
    : [];
  const haystack = `${record.title} ${record.summary} ${record.body} ${(record.tags ?? []).join(' ')}`.toLowerCase();
  const termHits = queryTerms.filter((term) => term && haystack.includes(term)).length;
  const statusBoost = record.status === 'confirmed' ? 20 : 8;
  const recency = record.updatedAt instanceof Date
    ? Math.max(0, 10 - ((Date.now() - record.updatedAt.getTime()) / 86_400_000))
    : 0;

  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    title: record.title,
    summary: record.summary,
    body: record.body,
    scope: record.scope,
    projectId: record.projectId ?? null,
    chatId: record.chatId ?? null,
    runId: record.runId ?? null,
    confidence: Number(record.confidence ?? 0.5),
    sensitivity: record.sensitivity,
    tags: Array.isArray(record.tags) ? record.tags : [],
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : new Date().toISOString(),
    sourceRefs,
    score: statusBoost + termHits * 12 + recency + Number(record.confidence ?? 0.5),
  };
}

function queryTerms(query: string): string[] {
  return normalizeWhitespace(query)
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"']+/)
    .filter((term) => term.length >= 2)
    .slice(0, 8);
}

export async function persistKnowledgeCandidates(candidates: KnowledgeAssetCandidate[]): Promise<KnowledgeSearchResult[]> {
  const results: KnowledgeSearchResult[] = [];

  for (const candidate of candidates) {
    const created = await prisma.knowledgeAsset.upsert({
      where: { dedupeKey: candidate.dedupeKey },
      create: {
        userId: candidate.userId,
        kind: candidate.kind,
        title: candidate.title,
        summary: candidate.summary,
        body: candidate.body,
        status: candidate.status,
        scope: candidate.scope,
        projectId: candidate.projectId,
        chatId: candidate.chatId,
        runId: candidate.runId,
        confidence: candidate.confidence,
        sensitivity: candidate.sensitivity,
        tags: candidate.tags,
        dedupeKey: candidate.dedupeKey,
        sourceRefs: {
          create: candidate.sourceRefs.map((ref) => ({
            sourceType: ref.sourceType,
            sourceId: ref.sourceId,
            projectId: ref.projectId ?? null,
            chatId: ref.chatId ?? null,
            runId: ref.runId ?? null,
            eventSeq: ref.eventSeq ?? null,
            label: ref.label ?? null,
            snippet: ref.snippet ?? null,
          })),
        },
      },
      update: {
        title: candidate.title,
        summary: candidate.summary,
        body: candidate.body,
        sensitivity: candidate.sensitivity,
        confidence: candidate.confidence,
        tags: candidate.tags,
      },
      include: { sourceRefs: true },
    });
    results.push(toSearchResult(created));
  }

  return results;
}

export async function extractKnowledgeAssetsForChat(input: {
  userId: string;
  chatId: string;
  runId?: string | null;
}): Promise<KnowledgeSearchResult[]> {
  const chat = await prisma.chat.findFirst({
    where: {
      id: input.chatId,
      userId: input.userId,
      includeInAskIndex: true,
    },
    select: {
      id: true,
      projectId: true,
      userId: true,
      includeInAskIndex: true,
      events: {
        where: {
          ...(input.runId ? { runId: input.runId } : {}),
        },
        orderBy: { seq: 'asc' },
        take: 80,
      },
    },
  });
  if (!chat) return [];

  const project = await prisma.project.findFirst({
    where: { id: chat.projectId, userId: input.userId },
    select: { includeInAskIndex: true },
  });
  if (project && project.includeInAskIndex === false) return [];

  const candidates = extractKnowledgeAssetsFromEvents({
    userId: input.userId,
    projectId: chat.projectId,
    chatId: chat.id,
    events: chat.events,
  });
  return persistKnowledgeCandidates(candidates);
}

export async function ensureRecentKnowledgeAssets(userId: string, limit = 8): Promise<void> {
  const chats = await prisma.chat.findMany({
    where: { userId, includeInAskIndex: true },
    orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
    take: Math.max(1, Math.min(limit, 20)),
    select: { id: true },
  });

  await Promise.all(chats.map((chat: { id: string }) => extractKnowledgeAssetsForChat({ userId, chatId: chat.id })));
}

export async function listKnowledgeAssets(input: {
  userId: string;
  status?: KnowledgeAssetStatus | 'all';
  kind?: KnowledgeAssetKind | 'all';
  query?: string;
  limit?: number;
}): Promise<KnowledgeSearchResult[]> {
  await ensureRecentKnowledgeAssets(input.userId, 6);
  const terms = queryTerms(input.query ?? '');
  const rows = await prisma.knowledgeAsset.findMany({
    where: {
      userId: input.userId,
      ...(input.status && input.status !== 'all' ? { status: input.status } : { status: { not: 'dismissed' } }),
      ...(input.kind && input.kind !== 'all' ? { kind: input.kind } : {}),
      ...(terms.length > 0
        ? {
            OR: terms.flatMap((term) => [
              { title: { contains: term, mode: 'insensitive' } },
              { summary: { contains: term, mode: 'insensitive' } },
              { body: { contains: term, mode: 'insensitive' } },
              { tags: { has: term } },
            ]),
          }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: Math.max(1, Math.min(input.limit ?? 40, 100)),
    include: { sourceRefs: true },
  });

  return rows
    .map((row) => toSearchResult(row, terms))
    .sort((a: KnowledgeSearchResult, b: KnowledgeSearchResult) => b.score - a.score);
}

export async function updateKnowledgeAsset(input: {
  userId: string;
  assetId: string;
  status?: KnowledgeAssetStatus;
  title?: string;
  summary?: string;
  body?: string;
  tags?: string[];
}): Promise<KnowledgeSearchResult | null> {
  const existing = await prisma.knowledgeAsset.findFirst({
    where: { id: input.assetId, userId: input.userId },
    select: { id: true },
  });
  if (!existing) return null;

  const updated = await prisma.knowledgeAsset.update({
    where: { id: existing.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.title === 'string' ? { title: truncate(input.title, 120) } : {}),
      ...(typeof input.summary === 'string' ? { summary: truncate(redactSensitiveText(input.summary), 320) } : {}),
      ...(typeof input.body === 'string' ? { body: redactSensitiveText(input.body).slice(0, 4000) } : {}),
      ...(Array.isArray(input.tags) ? { tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12) } : {}),
    },
    include: { sourceRefs: true },
  });

  return toSearchResult(updated);
}

export async function getProjectCandidates(userId: string, query: string, limit = 4): Promise<ProjectCandidate[]> {
  const terms = queryTerms(query);
  const rows = await prisma.project.findMany({
    where: {
      userId,
      ...(terms.length > 0
        ? {
            OR: terms.flatMap((term) => [
              { id: { contains: term, mode: 'insensitive' } },
              { path: { contains: term, mode: 'insensitive' } },
              { alias: { contains: term, mode: 'insensitive' } },
            ]),
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.max(1, Math.min(limit, 8)),
  });

  return rows.map((row) => ({
    projectId: row.id,
    projectName: row.alias ?? row.path?.split('/').filter(Boolean).pop() ?? row.id,
    lastActivityAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
  }));
}

export function buildAskAnswerDraft(input: {
  query: string;
  memories: KnowledgeSearchResult[];
  externalResults: ExternalSearchResult[];
  projectCandidates: ProjectCandidate[];
}): AskAnswerDraft {
  if (EXECUTION_REQUEST_PATTERN.test(input.query)) {
    const projectLine = input.projectCandidates.length > 0
      ? `관련 프로젝트 후보: ${input.projectCandidates.map((project) => project.projectName).join(', ')}.`
      : '관련 프로젝트 후보를 찾지 못했습니다.';
    const arisMemory = `이 요청은 Project chat에서 진행하는 것이 맞습니다. ${projectLine}`;
    const inference = 'Ask ARIS는 코드 수정, 커밋, 배포를 직접 실행하지 않습니다. 대신 관련 기억을 정리하고 Project chat으로 이어갈 초안을 제공합니다.';
    return {
      intent: 'project_handoff',
      content: `${arisMemory}\n\n${inference}`,
      sections: {
        arisMemory,
        externalSearch: '외부 검색은 이 실행성 요청의 주 근거로 사용하지 않았습니다.',
        inference,
      },
      citations: input.memories.flatMap((memory) => memory.sourceRefs).slice(0, 6),
      suggestedProjects: input.projectCandidates,
    };
  }

  const memoryLines = input.memories.length > 0
    ? input.memories.slice(0, 5).map((memory, index) => `${index + 1}. ${memory.title}: ${memory.summary}`).join('\n')
    : 'ARIS 내부 기억에서 직접 매칭되는 확정/후보 자산을 찾지 못했습니다.';
  const externalLines = input.externalResults.length > 0
    ? input.externalResults.slice(0, 3).map((result, index) => `${index + 1}. ${result.title}: ${result.snippet}`).join('\n')
    : '외부 검색 결과가 없거나 외부 검색 커넥터가 설정되어 있지 않습니다.';
  const inference = input.memories.length > 0
    ? '위 ARIS 기억을 우선 근거로 삼고, 부족한 부분은 외부 검색 또는 일반 추론 영역으로 분리했습니다.'
    : '저장된 ARIS 기억이 부족하므로 답변 확신도는 낮습니다. 필요한 작업은 Project chat에서 이어가는 것이 좋습니다.';

  return {
    intent: 'memory_answer',
    content: `ARIS 기억\n${memoryLines}\n\n외부 검색\n${externalLines}\n\n추론\n${inference}`,
    sections: {
      arisMemory: memoryLines,
      externalSearch: externalLines,
      inference,
    },
    citations: input.memories.flatMap((memory) => memory.sourceRefs).slice(0, 8),
    suggestedProjects: input.projectCandidates,
  };
}

export async function createAskThread(input: {
  userId: string;
  title?: string;
}): Promise<{ id: string; title: string; createdAt: string; updatedAt: string }> {
  const title = truncate(input.title ?? 'Ask ARIS', 120) || 'Ask ARIS';
  const created = await prisma.askThread.create({
    data: { userId: input.userId, title },
  });
  return {
    id: created.id,
    title: created.title,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function appendAskExchange(input: {
  userId: string;
  threadId: string;
  query: string;
  draft: AskAnswerDraft;
}): Promise<{
  userMessage: { id: string; role: 'user'; content: string; createdAt: string };
  assistantMessage: { id: string; role: 'assistant'; content: string; createdAt: string; sources: unknown; meta: unknown };
}> {
  const thread = await prisma.askThread.findFirst({
    where: { id: input.threadId, userId: input.userId },
    select: { id: true },
  });
  if (!thread) {
    throw new Error('ASK_THREAD_NOT_FOUND');
  }

  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.askMessage.create({
      data: {
        threadId: thread.id,
        role: 'user',
        content: input.query,
      },
    }),
    prisma.askMessage.create({
      data: {
        threadId: thread.id,
        role: 'assistant',
        content: input.draft.content,
        sources: {
          citations: input.draft.citations,
          suggestedProjects: input.draft.suggestedProjects,
        },
        meta: {
          intent: input.draft.intent,
          sections: input.draft.sections,
        },
      },
    }),
    prisma.askThread.update({
      where: { id: thread.id },
      data: { title: truncate(input.query, 80) || 'Ask ARIS' },
    }),
  ]);

  return {
    userMessage: {
      id: userMessage.id,
      role: 'user',
      content: userMessage.content,
      createdAt: userMessage.createdAt.toISOString(),
    },
    assistantMessage: {
      id: assistantMessage.id,
      role: 'assistant',
      content: assistantMessage.content,
      createdAt: assistantMessage.createdAt.toISOString(),
      sources: assistantMessage.sources,
      meta: assistantMessage.meta,
    },
  };
}
