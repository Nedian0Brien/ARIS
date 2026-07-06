import { homedir } from 'node:os';
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
  }): Promise<{ id: string; chatId?: string | null }>;
  ensureImportedAgentChat(input: {
    importId: string;
    arisSessionId: string;
    userId: string;
    title: string;
  }): Promise<{ chatId: string }>;
  appendImportedAgentEvents(input: {
    importId: string;
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sessionId: string;
    chatId: string;
    messages: ImportedProviderMessage[];
  }): Promise<Array<{ id: string }>>;
};

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
};

export type AgentSessionImportRunResult = {
  discovered: number;
  linkedChats: number;
  importedEvents: number;
  skipped: number;
};

type CandidateFile = {
  provider: ImportedAgentProvider;
  path: string;
  size: bigint;
  mtimeMs: bigint;
  fallbackSessionId?: string;
};

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
    candidates.push({
      provider: item.provider,
      path: item.path,
      size: BigInt(details.size),
      mtimeMs: BigInt(Math.floor(details.mtimeMs)),
      ...(item.provider === 'claude' ? { fallbackSessionId: item.path.replace(/\.jsonl$/, '').split('/').at(-1) } : {}),
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

function buildImportedChatTitle(provider: ImportedAgentProvider): string {
  return provider === 'codex' ? 'Codex 가져온 대화' : 'Claude 가져온 대화';
}

export async function runAgentSessionImportOnce(options: AgentSessionImportRunOptions): Promise<AgentSessionImportRunResult> {
  const result: AgentSessionImportRunResult = {
    discovered: 0,
    linkedChats: 0,
    importedEvents: 0,
    skipped: 0,
  };
  const candidates = await collectCandidates(options);
  const normalizedProjectPath = resolve(options.projectPath);
  for (const candidate of candidates) {
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
    const { chatId } = imported.chatId
      ? { chatId: imported.chatId }
      : await options.store.ensureImportedAgentChat({
          importId: imported.id,
          arisSessionId: normalizedProjectPath,
          userId: options.userId,
          title: buildImportedChatTitle(parsed.provider),
        });
    if (!imported.chatId) {
      result.linkedChats += 1;
    }
    const tailMessages = selectTailMessages(parsed.messages, options.tailTurns);
    const events = await options.store.appendImportedAgentEvents({
      importId: imported.id,
      provider: parsed.provider,
      providerSessionId: parsed.providerSessionId,
      sessionId: normalizedProjectPath,
      chatId,
      messages: tailMessages,
    });
    result.importedEvents += events.length;
  }
  return result;
}
