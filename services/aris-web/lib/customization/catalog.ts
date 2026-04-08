import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/config';
import { mapWorkspacePathToHost, normalizeVisiblePath } from '@/lib/fs/pathResolver';

const WORKSPACE_MOUNT_ROOT = '/workspace';
const KNOWN_INSTRUCTION_DOCS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CODEX.md'] as const;
const MCP_DEBUG_LINE_PATTERN = /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}T[^ ]+)\s+\[[A-Z]+\]\s+(?<message>.*)$/;
const MCP_SERVER_PATTERN = /MCP server "([^"]+)":\s*(.+)$/;
const MCP_CONNECTED_PATTERN = /\[MCP\]\s+Server "([^"]+)" connected/i;

export type InstructionDocSummary = {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
};

export type SkillSummary = {
  id: string;
  name: string;
  description: string;
  source: 'agents' | 'codex';
  relativePath: string;
};

export type MpcServerSummary = {
  id: string;
  name: string;
  status: 'connected' | 'needs_auth' | 'failed' | 'connecting' | 'unknown';
  source: string;
  detail: string;
  lastSeenAt: string | null;
};

export type CustomizationOverview = {
  workspacePath: string;
  instructionDocs: InstructionDocSummary[];
  skills: SkillSummary[];
  mcpServers: MpcServerSummary[];
};

type SkillEntry = SkillSummary & {
  fullPath: string;
};

export type ResolvedWorkspace = {
  displayPath: string;
  runtimePath: string;
};

function normalizeAbsolutePath(input: string): string {
  return path.resolve(input).replace(/\/+$/, '') || '/';
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspacePath(projectPath: string): Promise<ResolvedWorkspace> {
  const trimmed = projectPath.trim();
  if (!trimmed) {
    throw new Error('워크스페이스 경로가 비어 있습니다.');
  }

  const absoluteProjectPath = normalizeAbsolutePath(trimmed);
  const displayPath = normalizeVisiblePath(trimmed);
  const runtimeCandidates = [...new Set<string>([
    displayPath,
    absoluteProjectPath,
    mapWorkspacePathToHost(absoluteProjectPath),
  ])];

  for (const runtimePath of runtimeCandidates) {
    if (!await pathExists(runtimePath)) {
      continue;
    }
    return {
      displayPath,
      runtimePath,
    };
  }

  throw new Error(`워크스페이스 경로를 해석할 수 없습니다: ${displayPath}`);
}

function toClientWorkspacePath(runtimePath: string): string {
  const normalizedRuntimePath = normalizeAbsolutePath(runtimePath);

  const hostMappedPath = mapWorkspacePathToHost(normalizedRuntimePath);
  if (hostMappedPath !== normalizedRuntimePath) {
    return hostMappedPath;
  }

  const hostHomeDir = normalizeAbsolutePath(env.HOST_HOME_DIR.trim() || '/home/ubuntu');
  if (
    normalizedRuntimePath === hostHomeDir ||
    normalizedRuntimePath.startsWith(`${hostHomeDir}/`)
  ) {
    return normalizedRuntimePath;
  }

  if (normalizedRuntimePath === WORKSPACE_MOUNT_ROOT) {
    return '/';
  }

  if (normalizedRuntimePath.startsWith(`${WORKSPACE_MOUNT_ROOT}/`)) {
    const relativePath = path.relative(WORKSPACE_MOUNT_ROOT, normalizedRuntimePath).split(path.sep).join('/');
    return relativePath ? `/${relativePath}` : '/';
  }

  if (env.NODE_ENV !== 'production') {
    const relativePath = path.relative(process.cwd(), normalizedRuntimePath).split(path.sep).join('/');
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return relativePath ? `/${relativePath}` : '/';
    }
  }

  return '/';
}

async function statIfExists(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

export async function listInstructionDocs(projectPath: string): Promise<InstructionDocSummary[]> {
  const resolved = await resolveWorkspacePath(projectPath);

  const docs = await Promise.all(KNOWN_INSTRUCTION_DOCS.map(async (name) => {
    const fullPath = path.join(resolved.runtimePath, name);
    const stat = await statIfExists(fullPath);
    return {
      id: name,
      name,
      path: path.join(resolved.displayPath, name),
      exists: Boolean(stat?.isFile()),
      sizeBytes: stat?.isFile() ? stat.size : null,
      updatedAt: stat?.isFile() ? stat.mtime.toISOString() : null,
    } satisfies InstructionDocSummary;
  }));

  return docs;
}

function ensureInstructionDocId(docId: string): asserts docId is (typeof KNOWN_INSTRUCTION_DOCS)[number] {
  if (!KNOWN_INSTRUCTION_DOCS.includes(docId as (typeof KNOWN_INSTRUCTION_DOCS)[number])) {
    throw new Error(`지원하지 않는 지침 문서입니다: ${docId}`);
  }
}

export async function readInstructionDoc(projectPath: string, docId: string): Promise<{ content: string; summary: InstructionDocSummary }> {
  ensureInstructionDocId(docId);
  const resolved = await resolveWorkspacePath(projectPath);
  const fullPath = path.join(resolved.runtimePath, docId);
  const content = await fs.readFile(fullPath, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  const stat = await statIfExists(fullPath);

  return {
    content,
    summary: {
      id: docId,
      name: docId,
      path: path.join(resolved.displayPath, docId),
      exists: Boolean(stat?.isFile()),
      sizeBytes: stat?.isFile() ? stat.size : Buffer.byteLength(content, 'utf8'),
      updatedAt: stat?.isFile() ? stat.mtime.toISOString() : null,
    },
  };
}

export async function writeInstructionDoc(projectPath: string, docId: string, content: string): Promise<InstructionDocSummary> {
  ensureInstructionDocId(docId);
  const resolved = await resolveWorkspacePath(projectPath);
  const fullPath = path.join(resolved.runtimePath, docId);
  await fs.writeFile(fullPath, content, 'utf8');
  const stat = await fs.stat(fullPath);

  return {
    id: docId,
    name: docId,
    path: path.join(resolved.displayPath, docId),
    exists: true,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function parseSkillFrontMatter(content: string): { name: string | null; description: string | null } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: null, description: null };
  }

  let name: string | null = null;
  let description: string | null = null;
  for (const line of match[1].split('\n')) {
    const [rawKey, ...rawRest] = line.split(':');
    if (!rawKey || rawRest.length === 0) continue;
    const key = rawKey.trim();
    const value = rawRest.join(':').trim();
    if (key === 'name') {
      name = value || null;
    }
    if (key === 'description') {
      description = value || null;
    }
  }
  return { name, description };
}

async function listSkillEntriesUnderRoot(rootPath: string, source: SkillSummary['source']): Promise<SkillEntry[]> {
  const results: SkillEntry[] = [];

  async function visitDirectory(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visitDirectory(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'SKILL.md') {
        continue;
      }

      const content = await fs.readFile(fullPath, 'utf8').catch(() => '');
      const frontMatter = parseSkillFrontMatter(content);
      const relativeSkillPath = path.relative(rootPath, fullPath);
      const skillDirName = path.basename(path.dirname(fullPath));
      results.push({
        id: `${source}:${relativeSkillPath}`,
        name: frontMatter.name ?? skillDirName,
        description: frontMatter.description ?? '설명 없음',
        source,
        relativePath: relativeSkillPath,
        fullPath,
      });
    }
  }

  if (await pathExists(rootPath)) {
    await visitDirectory(rootPath);
  }

  return results;
}

async function buildSkillCatalog(): Promise<SkillEntry[]> {
  const [agentSkills, codexSkills] = await Promise.all([
    listSkillEntriesUnderRoot(env.ARIS_AGENT_SKILLS_ROOT, 'agents'),
    listSkillEntriesUnderRoot(env.ARIS_CODEX_SKILLS_ROOT, 'codex'),
  ]);

  return [...agentSkills, ...codexSkills].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listSkills(): Promise<SkillSummary[]> {
  const catalog = await buildSkillCatalog();
  return catalog.map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    source: entry.source,
    relativePath: entry.relativePath,
  }));
}

export async function readSkillContent(skillId: string): Promise<{ summary: SkillSummary; content: string }> {
  const catalog = await buildSkillCatalog();
  const target = catalog.find((entry) => entry.id === skillId);
  if (!target) {
    throw new Error(`스킬을 찾을 수 없습니다: ${skillId}`);
  }

  const content = await fs.readFile(target.fullPath, 'utf8');
  return {
    summary: {
      id: target.id,
      name: target.name,
      description: target.description,
      source: target.source,
      relativePath: target.relativePath,
    },
    content,
  };
}

function inferMcpStatus(detail: string): MpcServerSummary['status'] {
  const normalized = detail.toLowerCase();
  if (normalized.includes('successfully connected') || normalized.includes(' connected')) {
    return 'connected';
  }
  if (normalized.includes('needs-auth')) {
    return 'needs_auth';
  }
  if (normalized.includes('connection failed') || normalized.includes('error')) {
    return 'failed';
  }
  if (normalized.includes('starting connection') || normalized.includes('initializing')) {
    return 'connecting';
  }
  return 'unknown';
}

function upsertMcpServer(
  map: Map<string, MpcServerSummary>,
  input: {
    name: string;
    detail: string;
    source: string;
    lastSeenAt: string | null;
    status?: MpcServerSummary['status'];
  },
) {
  const current = map.get(input.name);
  const nextStatus = input.status ?? inferMcpStatus(input.detail);
  const nextTimestamp = input.lastSeenAt ?? current?.lastSeenAt ?? null;
  if (current && current.lastSeenAt && input.lastSeenAt && current.lastSeenAt > input.lastSeenAt) {
    return;
  }

  map.set(input.name, {
    id: input.name,
    name: input.name,
    status: nextStatus,
    source: input.source,
    detail: input.detail,
    lastSeenAt: nextTimestamp,
  });
}

async function readLatestMcpDebugFiles(debugDir: string): Promise<string[]> {
  const entries = await fs.readdir(debugDir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map(async (entry) => {
      const fullPath = path.join(debugDir, entry.name);
      const stat = await fs.stat(fullPath).catch(() => null);
      return stat ? { fullPath, mtimeMs: stat.mtimeMs } : null;
    }));

  return files
    .filter((file): file is NonNullable<typeof file> => Boolean(file))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 6)
    .map((file) => file.fullPath);
}

export async function listMcpServers(): Promise<MpcServerSummary[]> {
  const result = new Map<string, MpcServerSummary>();
  const needsAuthCachePath = path.join(env.ARIS_CLAUDE_HOME, 'mcp-needs-auth-cache.json');
  const debugDir = path.join(env.ARIS_CLAUDE_HOME, 'debug');

  const needsAuthCache = await fs.readFile(needsAuthCachePath, 'utf8').catch(() => '');
  if (needsAuthCache) {
    try {
      const parsed = JSON.parse(needsAuthCache) as Record<string, { timestamp?: number }>;
      for (const [name, value] of Object.entries(parsed)) {
        upsertMcpServer(result, {
          name,
          detail: '인증 필요',
          source: 'claude-cache',
          lastSeenAt: typeof value?.timestamp === 'number' ? new Date(value.timestamp).toISOString() : null,
          status: 'needs_auth',
        });
      }
    } catch {
      // 캐시 파일이 손상된 경우에도 패널 전체가 깨지지 않도록 무시한다.
    }
  }

  const debugFiles = await readLatestMcpDebugFiles(debugDir);
  for (const debugFile of debugFiles) {
    const content = await fs.readFile(debugFile, 'utf8').catch(() => '');
    for (const line of content.split('\n')) {
      const matchedLine = line.match(MCP_DEBUG_LINE_PATTERN);
      if (!matchedLine?.groups) {
        continue;
      }
      const timestamp = matchedLine.groups.timestamp ?? null;
      const message = matchedLine.groups.message ?? '';

      const serverMatch = message.match(MCP_SERVER_PATTERN);
      if (serverMatch) {
        upsertMcpServer(result, {
          name: serverMatch[1],
          detail: serverMatch[2],
          source: 'claude-debug',
          lastSeenAt: timestamp,
        });
        continue;
      }

      const connectedMatch = message.match(MCP_CONNECTED_PATTERN);
      if (connectedMatch) {
        upsertMcpServer(result, {
          name: connectedMatch[1],
          detail: 'connected',
          source: 'claude-debug',
          lastSeenAt: timestamp,
          status: 'connected',
        });
      }
    }
  }

  return [...result.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildCustomizationOverview(projectPath: string): Promise<CustomizationOverview> {
  const resolved = await resolveWorkspacePath(projectPath);
  const [instructionDocs, skills, mcpServers] = await Promise.all([
    listInstructionDocs(projectPath),
    listSkills(),
    listMcpServers(),
  ]);

  return {
    workspacePath: resolved.displayPath,
    instructionDocs,
    skills,
    mcpServers,
  };
}

export async function resolveWorkspaceClientPath(projectPath: string): Promise<string> {
  const resolved = await resolveWorkspacePath(projectPath);
  return toClientWorkspacePath(resolved.displayPath);
}
