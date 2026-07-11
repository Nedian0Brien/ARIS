import { homedir } from 'node:os';
import type { ChatUsageStats } from '../../types.js';
import { join, resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import type {
  ImportedAgentProvider,
  ImportedProviderMessage,
  ParsedProviderSessionLog,
} from './providerSessionImportParsers.js';
import {
  parseClaudeSessionLog,
  parseCodexSessionLog,
  selectTailMessages,
} from './providerSessionImportParsers.js';

type ImportedAgentSessionStore = {
  discoverImportedAgentSession(input: {
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sourcePath: string;
    projectPath: string;
    fileSize?: bigint;
    fileMtimeMs?: bigint;
    oldestCursorOffset?: bigint | null;
    newestCursorOffset?: bigint | null;
    status?: string;
  }): Promise<{
    id: string;
    chatId?: string | null;
    arisSessionId?: string | null;
    provider: string;
    providerSessionId: string;
    sourcePath: string;
    projectPath: string;
    fileSize?: bigint;
    fileMtimeMs?: bigint;
    oldestCursorOffset?: bigint | null;
    newestCursorOffset?: bigint | null;
    hasMoreBefore: boolean;
    status?: string;
  }>;
  resolveProjectSessionIdByPath(projectPath: string): Promise<string | null>;
  /**
   * Find an existing top-level chat (parentChatId IS NULL, i.e. not a subagent)
   * that already owns a provider session id — matched by Chat.threadId or by any
   * of its events' meta.threadId. Used to (a) detect ARIS-originated transcripts
   * that must not be re-imported as duplicate chats, and (b) resolve the parent
   * chat a subagent belongs to. `isImported` is true when that chat is itself an
   * imported agent session (vs a native ARIS chat).
   */
  findOwningChat?(providerSessionId: string): Promise<{ chatId: string; isImported: boolean } | null>;
  /** transcript에서 수집한 usage를 Chat.usageStats에 반영한다(선택). */
  updateChatUsage?(input: { chatId: string; usage: ChatUsageStats }): Promise<void>;
  ensureImportedAgentChat(input: {
    importId: string;
    arisSessionId: string;
    userId: string;
    title: string;
    parentChatId?: string | null;
    subagentType?: string | null;
    subagentStatus?: string | null;
  }): Promise<{ chatId: string }>;
  /**
   * Mark an imported session as ARIS-native: link it to the existing native chat
   * without creating a duplicate chat and without importing its events (the live
   * ARIS runtime already owns them). Idempotent.
   */
  markImportedAgentSessionNative?(input: {
    importId: string;
    arisSessionId: string;
    chatId: string;
  }): Promise<void>;
  /** Refresh subagent metadata (type/status) on an already-linked subagent chat. */
  updateSubagentChatMeta?(input: {
    chatId: string;
    parentChatId?: string | null;
    subagentType?: string | null;
    subagentStatus?: string | null;
  }): Promise<void>;
  appendImportedAgentEvents(input: {
    importId: string;
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sessionId: string;
    chatId: string;
    messages: ImportedProviderMessage[];
    hasMoreBefore?: boolean;
  }): Promise<Array<{ id: string }>>;
  listImportedAgentSessionsForBackfill?(input: {
    projectPath: string;
    limit: number;
  }): Promise<Array<{
    id: string;
    chatId?: string | null;
    hasMoreBefore: boolean;
  }>>;
  loadOlderImportedAgentEvents?(input: {
    chatId: string;
    limitTurns: number;
  }): Promise<{ events: Array<{ id: string }>; hasMoreBefore: boolean }>;
};

export type AgentSessionImportMode = 'sync' | 'backfill';

export type AgentSessionImportRunOptions = {
  store: ImportedAgentSessionStore;
  projectPath: string;
  userId?: string;
  codexHome?: string;
  claudeHome?: string;
  lookbackDays: number;
  maxFiles: number;
  maxBytes: number;
  tailTurns: number;
  mode?: AgentSessionImportMode;
  maxEvents?: number;
  backfillSessionLimit?: number;
  backfillTurnsPerBatch?: number;
};

export type AgentSessionImportRunResult = {
  discovered: number;
  linkedChats: number;
  importedEvents: number;
  backfilledEvents: number;
  skipped: number;
};

type CandidateFile = {
  provider: ImportedAgentProvider;
  path: string;
  size: bigint;
  mtimeMs: bigint;
  fallbackSessionId?: string;
  isSubagent?: boolean;
  subagentType?: string;
  subagentDescription?: string;
  subagentToolUseId?: string;
};

/** A Claude Code subagent transcript lives under `<parentSessionId>/subagents/`. */
export function isSubagentPath(path: string): boolean {
  return path.includes('/subagents/');
}

/**
 * Sidecar metadata Claude Code writes next to each subagent transcript:
 * `agent-<id>.jsonl` -> `agent-<id>.meta.json` with { agentType, description, toolUseId }.
 */
export async function readSubagentMeta(subagentPath: string): Promise<{
  agentType?: string;
  description?: string;
  toolUseId?: string;
}> {
  const metaPath = subagentPath.replace(/\.jsonl$/, '.meta.json');
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(typeof parsed.agentType === 'string' ? { agentType: parsed.agentType } : {}),
      ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}),
      ...(typeof parsed.toolUseId === 'string' ? { toolUseId: parsed.toolUseId } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Resolve the parent session transcript for a subagent file.
 * `.../projects/<projectId>/<parentSessionId>/subagents/agent-x.jsonl`
 *   -> `.../projects/<projectId>/<parentSessionId>.jsonl`
 */
export function subagentParentTranscriptPath(subagentPath: string): string {
  const subagentsDir = resolve(subagentPath, '..');
  const parentSessionDir = resolve(subagentsDir, '..');
  return `${parentSessionDir}.jsonl`;
}

/**
 * Best-effort subagent run status. A completed subagent has a `tool_result` for
 * its Task `toolUseId` in the parent transcript; a still-running one has only the
 * `tool_use`. Falls back to 'completed' when we cannot prove it is running
 * (missing toolUseId / unreadable parent) to avoid stale "running" badges.
 */
export async function deriveSubagentStatus(
  subagentPath: string,
  toolUseId: string | undefined,
  parentReadCache: Map<string, string>,
): Promise<'running' | 'completed'> {
  if (!toolUseId) {
    return 'completed';
  }
  const parentPath = subagentParentTranscriptPath(subagentPath);
  let contents = parentReadCache.get(parentPath);
  if (contents === undefined) {
    try {
      contents = await readFile(parentPath, 'utf8');
    } catch {
      contents = '';
    }
    parentReadCache.set(parentPath, contents);
  }
  if (!contents) {
    return 'completed';
  }
  const hasResult = contents.includes(`"tool_use_id":"${toolUseId}"`)
    || contents.includes(`"tool_use_id": "${toolUseId}"`);
  return hasResult ? 'completed' : 'running';
}

async function listJsonlFiles(root: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listJsonlFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(path);
    }
  }
  return results;
}

function buildClaudeProjectDir(claudeHome: string, projectPath: string): string {
  const projectId = resolve(projectPath).replace(/[^a-zA-Z0-9-]/g, '-');
  return join(claudeHome, 'projects', projectId);
}

async function collectCandidates(options: AgentSessionImportRunOptions): Promise<CandidateFile[]> {
  const codexHome = options.codexHome ?? join(homedir(), '.codex');
  const claudeHome = options.claudeHome ?? join(homedir(), '.claude');
  const cutoffMs = Date.now() - (Math.max(1, options.lookbackDays) * 24 * 60 * 60 * 1000);
  const codexFiles = await listJsonlFiles(join(codexHome, 'sessions'));
  const claudeFiles = await listJsonlFiles(buildClaudeProjectDir(claudeHome, options.projectPath));
  const paths: Array<{ provider: ImportedAgentProvider; path: string }> = [
    ...codexFiles
      .filter((path) => path.includes('rollout-'))
      .map((path) => ({ provider: 'codex' as const, path })),
    ...claudeFiles.map((path) => ({ provider: 'claude' as const, path })),
  ];
  const candidates: CandidateFile[] = [];
  for (const item of paths) {
    let details: Awaited<ReturnType<typeof stat>>;
    try {
      details = await stat(item.path);
    } catch {
      continue;
    }
    if (details.mtimeMs < cutoffMs || details.size > options.maxBytes) {
      continue;
    }
    const subagent = item.provider === 'claude' && isSubagentPath(item.path);
    const meta = subagent ? await readSubagentMeta(item.path) : {};
    candidates.push({
      provider: item.provider,
      path: item.path,
      size: BigInt(details.size),
      mtimeMs: BigInt(Math.floor(details.mtimeMs)),
      ...(item.provider === 'claude' ? { fallbackSessionId: item.path.replace(/\.jsonl$/, '').split('/').at(-1) } : {}),
      ...(subagent ? { isSubagent: true } : {}),
      ...(meta.agentType ? { subagentType: meta.agentType } : {}),
      ...(meta.description ? { subagentDescription: meta.description } : {}),
      ...(meta.toolUseId ? { subagentToolUseId: meta.toolUseId } : {}),
    });
  }
  return candidates
    .sort((a, b) => Number(b.mtimeMs - a.mtimeMs))
    .slice(0, Math.max(1, options.maxFiles));
}

function parseCandidate(candidate: CandidateFile, contents: string): ParsedProviderSessionLog {
  if (candidate.provider === 'codex') {
    return parseCodexSessionLog(contents, { sourcePath: candidate.path });
  }
  return parseClaudeSessionLog(contents, {
    sourcePath: candidate.path,
    ...(candidate.fallbackSessionId ? { fallbackSessionId: candidate.fallbackSessionId } : {}),
  });
}

function isInjectedContextMessage(text: string): boolean {
  const normalized = text.trim();
  return normalized.startsWith('# AGENTS.md instructions')
    || normalized.startsWith('<INSTRUCTIONS>')
    || normalized.includes('\n<INSTRUCTIONS>')
    || normalized.startsWith('We need answer')
    || normalized.startsWith('We need respond')
    || normalized.startsWith('We need inspect');
}

function normalizeImportedChatTitle(text: string): string {
  const firstLine = text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
  if (firstLine.length <= 80) {
    return firstLine;
  }
  return `${firstLine.slice(0, 77).trimEnd()}...`;
}

export function buildImportedChatTitle(
  provider: ImportedAgentProvider,
  messages: ImportedProviderMessage[],
): string {
  const firstUserMessage = messages.find((message) => (
    message.role === 'user'
    && message.text.trim().length > 0
    && !isInjectedContextMessage(message.text)
  ));
  if (firstUserMessage) {
    return normalizeImportedChatTitle(firstUserMessage.text);
  }
  return provider === 'codex' ? 'Codex 가져온 대화' : 'Claude 가져온 대화';
}

function hasMessagesBeforeSelection(
  messages: ImportedProviderMessage[],
  selected: ImportedProviderMessage[],
): boolean {
  const firstSelectedOffset = selected.reduce<bigint | null>(
    (min, message) => (min === null || message.sourceOffset < min ? message.sourceOffset : min),
    null,
  );
  return firstSelectedOffset !== null && messages.some((message) => message.sourceOffset < firstSelectedOffset);
}

function selectNewerMessages(
  messages: ImportedProviderMessage[],
  cursor: bigint | null | undefined,
  maxEvents: number,
): ImportedProviderMessage[] {
  if (cursor === null || cursor === undefined) {
    return [];
  }
  return messages
    .filter((message) => message.sourceOffset > cursor)
    .slice(0, Math.max(0, maxEvents));
}

async function runBackfill(options: AgentSessionImportRunOptions, result: AgentSessionImportRunResult): Promise<void> {
  if (typeof options.store.listImportedAgentSessionsForBackfill !== 'function'
    || typeof options.store.loadOlderImportedAgentEvents !== 'function') {
    return;
  }
  let remainingEvents = Math.max(0, options.maxEvents ?? 0);
  if (remainingEvents <= 0) {
    return;
  }
  const sessions = await options.store.listImportedAgentSessionsForBackfill({
    projectPath: resolve(options.projectPath),
    limit: Math.max(1, options.backfillSessionLimit ?? options.maxFiles),
  });
  for (const session of sessions) {
    if (!session.chatId || !session.hasMoreBefore || remainingEvents <= 0) {
      continue;
    }
    while (remainingEvents > 0) {
      const batch = await options.store.loadOlderImportedAgentEvents({
        chatId: session.chatId,
        limitTurns: Math.max(1, options.backfillTurnsPerBatch ?? options.tailTurns),
      });
      const importedCount = batch.events.length;
      result.backfilledEvents += importedCount;
      result.importedEvents += importedCount;
      remainingEvents -= importedCount;
      if (!batch.hasMoreBefore || importedCount === 0) {
        break;
      }
    }
  }
}

export async function runAgentSessionImportOnce(options: AgentSessionImportRunOptions): Promise<AgentSessionImportRunResult> {
  const result: AgentSessionImportRunResult = {
    discovered: 0,
    linkedChats: 0,
    importedEvents: 0,
    backfilledEvents: 0,
    skipped: 0,
  };
  const maxEvents = Math.max(1, options.maxEvents ?? Number.POSITIVE_INFINITY);
  let remainingEvents = maxEvents;
  const candidates = await collectCandidates(options);
  const normalizedProjectPath = resolve(options.projectPath);
  // Cache parent-transcript reads within a single run so N subagents sharing a
  // parent trigger at most one read of that (potentially large) transcript.
  const parentReadCache = new Map<string, string>();
  for (const candidate of candidates) {
    if (remainingEvents <= 0) {
      break;
    }
    let contents: string;
    try {
      contents = await readFile(candidate.path, 'utf8');
    } catch {
      result.skipped += 1;
      continue;
    }
    const parsed = parseCandidate(candidate, contents);
    if (!parsed.projectPath || resolve(parsed.projectPath) !== normalizedProjectPath) {
      result.skipped += 1;
      continue;
    }
    const imported = await options.store.discoverImportedAgentSession({
      provider: parsed.provider,
      providerSessionId: parsed.providerSessionId,
      sourcePath: parsed.sourcePath,
      projectPath: parsed.projectPath,
      fileSize: candidate.size,
      fileMtimeMs: candidate.mtimeMs,
      oldestCursorOffset: parsed.oldestCursorOffset,
      newestCursorOffset: parsed.newestCursorOffset,
      status: 'discovered',
    });
    result.discovered += 1;
    if (!options.userId) {
      continue;
    }
    // Already resolved as an ARIS-native transcript on a previous run: the live
    // runtime owns these events, so importing them again would duplicate messages
    // inside the native chat. Nothing to do.
    if (imported.status === 'native') {
      // 네이티브(ARIS 발) 채팅은 이벤트를 재수입하지 않지만, usage는 transcript가
      // 유일한 실측 소스이므로 여기서 갱신한다.
      if (imported.chatId && parsed.usage && options.store.updateChatUsage) {
        await options.store.updateChatUsage({ chatId: imported.chatId, usage: parsed.usage });
      }
      continue;
    }
    const arisSessionId = await options.store.resolveProjectSessionIdByPath(normalizedProjectPath);
    if (!arisSessionId) {
      result.skipped += 1;
      continue;
    }
    const isSubagent = candidate.isSubagent === true || parsed.isSubagent;

    // Problem 2: a freshly-discovered top-level transcript whose provider session
    // id already belongs to a native ARIS chat is an ARIS-originated session that
    // came back through the file scan. Link the bookkeeping row to that chat and
    // skip — never create a duplicate chat, never re-import its events.
    if (!isSubagent && !imported.chatId && options.store.findOwningChat && options.store.markImportedAgentSessionNative) {
      const owning = await options.store.findOwningChat(parsed.providerSessionId);
      if (owning && !owning.isImported) {
        await options.store.markImportedAgentSessionNative({
          importId: imported.id,
          arisSessionId,
          chatId: owning.chatId,
        });
        result.skipped += 1;
        continue;
      }
    }

    // Problem 1: subagent (Task tool) transcripts are still imported, but into a
    // hidden chat linked to their parent chat so they surface only in the subagent
    // sidebar — never in the main chat list.
    let subagentStatus: 'running' | 'completed' | null = null;
    let parentChatId: string | null = null;
    if (isSubagent) {
      subagentStatus = await deriveSubagentStatus(candidate.path, candidate.subagentToolUseId, parentReadCache);
      // parsed.providerSessionId for a subagent is the PARENT session id, so this
      // resolves the chat the subagent belongs to (native or imported parent).
      parentChatId = options.store.findOwningChat
        ? (await options.store.findOwningChat(parsed.providerSessionId))?.chatId ?? null
        : null;
    }

    const title = isSubagent && candidate.subagentDescription
      ? normalizeImportedChatTitle(candidate.subagentDescription)
      : buildImportedChatTitle(parsed.provider, parsed.messages);

    const chatId = imported.chatId
      ? imported.chatId
      : (await options.store.ensureImportedAgentChat({
          importId: imported.id,
          arisSessionId,
          userId: options.userId,
          title,
          ...(isSubagent
            ? { parentChatId, subagentType: candidate.subagentType ?? null, subagentStatus }
            : {}),
        })).chatId;
    if (!imported.chatId) {
      result.linkedChats += 1;
    } else if (isSubagent && options.store.updateSubagentChatMeta) {
      // Refresh status/parent linkage on an already-linked subagent chat (the
      // parent chat may have been imported after the subagent; status may flip
      // from running to completed).
      await options.store.updateSubagentChatMeta({
        chatId,
        parentChatId,
        subagentType: candidate.subagentType ?? null,
        subagentStatus,
      });
    }
    if (parsed.usage && options.store.updateChatUsage) {
      await options.store.updateChatUsage({ chatId, usage: parsed.usage });
    }
    const selectedMessages = imported.chatId
      ? selectNewerMessages(parsed.messages, imported.newestCursorOffset, remainingEvents)
      : selectTailMessages(parsed.messages, options.tailTurns).slice(0, remainingEvents);
    if (selectedMessages.length === 0) {
      continue;
    }
    const events = await options.store.appendImportedAgentEvents({
      importId: imported.id,
      provider: parsed.provider,
      providerSessionId: parsed.providerSessionId,
      sessionId: normalizedProjectPath,
      chatId,
      messages: selectedMessages,
      hasMoreBefore: imported.chatId
        ? imported.hasMoreBefore
        : hasMessagesBeforeSelection(parsed.messages, selectedMessages),
    });
    result.importedEvents += events.length;
    remainingEvents -= events.length;
  }
  if (options.mode === 'backfill') {
    await runBackfill({ ...options, maxEvents: remainingEvents }, result);
  }
  return result;
}
