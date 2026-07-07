import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  deriveSubagentStatus,
  isSubagentPath,
  readSubagentMeta,
} from '../src/runtime/import/agentSessionImportWorker.js';
import { parseClaudeSessionLog } from '../src/runtime/import/providerSessionImportParsers.js';

type OwnerChat = {
  id: string;
  sessionId: string;
  isImported: boolean;
  importedSourcePath?: string | null;
};

type SubagentChatState = {
  parentChatId?: string | null;
  subagentType?: string | null;
  subagentStatus?: string | null;
  title?: string | null;
};

type Action = {
  kind: 'link-subagent' | 'mark-native-duplicate';
  importId: string;
  sourcePath: string;
  chatId?: string | null;
  targetChatId?: string | null;
  reason: string;
};

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const db = new PrismaClient({ adapter });

async function assertSchemaReady(): Promise<void> {
  const rows = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Chat'
      AND column_name IN ('parentChatId', 'subagentType', 'subagentStatus')
  `;
  const found = new Set(rows.map((row) => row.column_name));
  const missing = ['parentChatId', 'subagentType', 'subagentStatus'].filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`Chat subagent migration is not applied. Missing columns: ${missing.join(', ')}`);
  }
}

function fallbackSessionId(sourcePath: string): string {
  return sourcePath.replace(/\.jsonl$/, '').split('/').at(-1) ?? sourcePath;
}

async function readClaudeProviderSessionId(sourcePath: string): Promise<string | null> {
  try {
    const contents = await readFile(sourcePath, 'utf8');
    return parseClaudeSessionLog(contents, {
      sourcePath,
      fallbackSessionId: fallbackSessionId(sourcePath),
    }).providerSessionId;
  } catch {
    return null;
  }
}

async function ownerFromChat(chatId: string): Promise<OwnerChat | null> {
  const chat = await db.sessionChat.findFirst({
    where: { id: chatId, parentChatId: null, subagentStatus: null },
    select: { id: true, sessionId: true },
  });
  if (!chat) {
    return null;
  }
  const imported = await db.importedAgentSession.findFirst({
    where: { chatId: chat.id },
    select: { sourcePath: true },
  });
  return {
    id: chat.id,
    sessionId: chat.sessionId,
    isImported: Boolean(imported),
    importedSourcePath: imported?.sourcePath ?? null,
  };
}

async function findOwnerChat(providerSessionId: string, options: {
  excludeChatId?: string | null;
  preferNative?: boolean;
} = {}): Promise<OwnerChat | null> {
  const trimmed = providerSessionId.trim();
  if (!trimmed) {
    return null;
  }

  const ids = new Set<string>();
  const byThread = await db.sessionChat.findMany({
    where: {
      threadId: trimmed,
      parentChatId: null,
      subagentStatus: null,
      ...(options.excludeChatId ? { id: { not: options.excludeChatId } } : {}),
    },
    orderBy: { lastActivityAt: 'desc' },
    select: { id: true },
  });
  for (const row of byThread) {
    ids.add(row.id);
  }

  const byEvent = await db.sessionChatEvent.findMany({
    where: { meta: { path: ['threadId'], equals: trimmed } },
    orderBy: { createdAt: 'desc' },
    select: { chatId: true },
    take: 50,
  });
  for (const row of byEvent) {
    if (row.chatId !== options.excludeChatId) {
      ids.add(row.chatId);
    }
  }

  const owners: OwnerChat[] = [];
  for (const id of ids) {
    const owner = await ownerFromChat(id);
    if (owner && !isSubagentPath(owner.importedSourcePath ?? '')) {
      owners.push(owner);
    }
  }

  if (options.preferNative) {
    return owners.find((owner) => !owner.isImported) ?? null;
  }
  return owners.find((owner) => !owner.isImported) ?? owners[0] ?? null;
}

async function reconcileSubagents(actions: Action[]): Promise<void> {
  const rows = await db.importedAgentSession.findMany({
    where: {
      provider: 'claude',
      sourcePath: { contains: '/subagents/' },
      chatId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const parentReadCache = new Map<string, string>();

  for (const row of rows) {
    const providerSessionId = await readClaudeProviderSessionId(row.sourcePath);
    if (!providerSessionId) {
      actions.push({
        kind: 'link-subagent',
        importId: row.id,
        sourcePath: row.sourcePath,
        chatId: row.chatId,
        reason: 'skip: cannot read provider session id',
      });
      continue;
    }
    const owner = await findOwnerChat(providerSessionId, { excludeChatId: row.chatId });
    if (!owner) {
      actions.push({
        kind: 'link-subagent',
        importId: row.id,
        sourcePath: row.sourcePath,
        chatId: row.chatId,
        reason: 'skip: parent chat not found',
      });
      continue;
    }
    const meta = await readSubagentMeta(row.sourcePath);
    const status = await deriveSubagentStatus(row.sourcePath, meta.toolUseId, parentReadCache);
    const current = row.chatId
      ? await db.sessionChat.findUnique({
          where: { id: row.chatId },
          select: {
            parentChatId: true,
            subagentType: true,
            subagentStatus: true,
            title: true,
          },
        })
      : null;
    const nextTitle = meta.description ? meta.description.trim().slice(0, 120) : null;
    const expected: SubagentChatState = {
      parentChatId: owner.id,
      subagentType: meta.agentType ?? null,
      subagentStatus: status,
      ...(nextTitle ? { title: nextTitle } : {}),
    };
    if (current && isSubagentChatCurrent(current, expected)) {
      continue;
    }
    actions.push({
      kind: 'link-subagent',
      importId: row.id,
      sourcePath: row.sourcePath,
      chatId: row.chatId,
      targetChatId: owner.id,
      reason: `link to parent chat, status=${status}`,
    });
    if (apply) {
      await db.sessionChat.update({
        where: { id: row.chatId ?? '' },
        data: {
          parentChatId: expected.parentChatId,
          subagentType: expected.subagentType,
          subagentStatus: expected.subagentStatus,
          ...(expected.title ? { title: expected.title } : {}),
        },
      });
      await db.importedAgentSession.update({
        where: { id: row.id },
        data: {
          arisSessionId: owner.sessionId,
          status: 'linked',
          lastImportedAt: new Date(),
        },
      });
    }
  }
}

function isSubagentChatCurrent(current: SubagentChatState, expected: SubagentChatState): boolean {
  if (current.parentChatId !== expected.parentChatId) {
    return false;
  }
  if ((current.subagentType ?? null) !== (expected.subagentType ?? null)) {
    return false;
  }
  if ((current.subagentStatus ?? null) !== (expected.subagentStatus ?? null)) {
    return false;
  }
  if (expected.title && current.title !== expected.title) {
    return false;
  }
  return true;
}

async function reconcileNativeDuplicates(actions: Action[]): Promise<void> {
  const rows = await db.importedAgentSession.findMany({
    where: {
      sourcePath: { not: { contains: '/subagents/' } },
      status: { not: 'native' },
      chatId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  });

  for (const row of rows) {
    const owner = await findOwnerChat(row.providerSessionId, {
      excludeChatId: row.chatId,
      preferNative: true,
    });
    if (!owner || owner.isImported) {
      continue;
    }
    actions.push({
      kind: 'mark-native-duplicate',
      importId: row.id,
      sourcePath: row.sourcePath,
      chatId: row.chatId,
      targetChatId: owner.id,
      reason: 'provider session already belongs to a native ARIS chat',
    });
    if (apply) {
      await db.importedAgentSession.update({
        where: { id: row.id },
        data: {
          arisSessionId: owner.sessionId,
          chatId: owner.id,
          status: 'native',
          lastImportedAt: new Date(),
        },
      });
      if (row.chatId && row.chatId !== owner.id) {
        await db.sessionChat.update({
          where: { id: row.chatId },
          data: { subagentStatus: 'native_duplicate' },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  await assertSchemaReady();
  const actions: Action[] = [];
  await reconcileSubagents(actions);
  await reconcileNativeDuplicates(actions);

  const summary = actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.kind] = (acc[action.kind] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    summary,
    actions,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
