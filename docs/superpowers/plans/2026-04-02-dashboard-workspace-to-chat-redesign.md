# 메인 대시보드 워크스페이스→채팅 단위 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 대시보드 UI를 워크스페이스 단위 → 채팅 단위로 재정렬하고, 새 워크스페이스 모달에서 에이전트/정책 선택을 제거한다.

**Architecture:** API에 채팅 집계 데이터(`GlobalChatStats`)를 추가하고, SessionDashboard 컴포넌트가 이를 소비하도록 변경한다. 유틸 함수는 `lib/happy/utils.ts`로 분리해 서버/클라이언트 양쪽에서 공유한다. 모든 작업은 전용 git worktree에서 수행한다.

**Tech Stack:** Next.js 14, TypeScript, Prisma (PostgreSQL), Vitest, React CSS Modules

---

## 준비: Worktree 생성

- [ ] **Step 1: node_modules 준비 확인**

```bash
ls /home/ubuntu/project/ARIS/services/aris-web/node_modules/.bin/vitest
ls /home/ubuntu/project/ARIS/services/aris-web/node_modules/.bin/tsc
```

없으면:
```bash
cd /home/ubuntu/project/ARIS/services/aris-web && npm install
```

- [ ] **Step 2: Worktree 생성**

```bash
cd /home/ubuntu/project/ARIS
bash scripts/create_worktree_with_shared_node_modules.sh \
  ../aris-dashboard-chat-redesign \
  feat/dashboard-chat-redesign
```

Expected: `../aris-dashboard-chat-redesign` 디렉터리 생성, node_modules 심볼릭 링크 연결

- [ ] **Step 3: worktree에서 작업 디렉터리 이동 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git branch  # feat/dashboard-chat-redesign 확인
ls services/aris-web/node_modules/.bin/vitest  # 심볼릭 링크 확인
```

이후 **모든 파일 수정은 `/home/ubuntu/aris-dashboard-chat-redesign/` 기준으로 수행**.

---

## Task 1: lib/happy/utils.ts 생성

**Files:**
- Create: `services/aris-web/lib/happy/utils.ts`
- Test: `services/aris-web/tests/happyUtils.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`services/aris-web/tests/happyUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';

describe('extractLastDirectoryName', () => {
  it('returns last segment of a path', () => {
    expect(extractLastDirectoryName('/workspace/my-project')).toBe('my-project');
  });

  it('returns last segment ignoring trailing slash', () => {
    expect(extractLastDirectoryName('/workspace/my-project/')).toBe('my-project');
  });

  it('returns / for root path', () => {
    expect(extractLastDirectoryName('/')).toBe('/');
  });

  it('returns fallback for empty string', () => {
    expect(extractLastDirectoryName('')).toBe('workspace');
  });

  it('handles windows-style backslash paths', () => {
    expect(extractLastDirectoryName('C:\\Users\\foo\\bar')).toBe('bar');
  });
});

describe('resolveAgentFlavor', () => {
  it('returns claude for claude', () => {
    expect(resolveAgentFlavor('claude')).toBe('claude');
  });

  it('returns codex for codex', () => {
    expect(resolveAgentFlavor('codex')).toBe('codex');
  });

  it('returns gemini for gemini', () => {
    expect(resolveAgentFlavor('gemini')).toBe('gemini');
  });

  it('returns unknown for unrecognized string', () => {
    expect(resolveAgentFlavor('gpt-4')).toBe('unknown');
  });

  it('returns unknown for null', () => {
    expect(resolveAgentFlavor(null)).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(resolveAgentFlavor(undefined)).toBe('unknown');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npm run test -- tests/happyUtils.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/happy/utils'`

- [ ] **Step 3: utils.ts 구현**

`services/aris-web/lib/happy/utils.ts`:

```ts
import type { AgentFlavor } from '@/lib/happy/types';

export function extractLastDirectoryName(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim().replace(/\/+$/, '');
  if (!normalized) return 'workspace';
  if (normalized === '/') return '/';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function resolveAgentFlavor(agent: unknown): AgentFlavor {
  if (agent === 'claude' || agent === 'codex' || agent === 'gemini') {
    return agent;
  }
  return 'unknown';
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npm run test -- tests/happyUtils.test.ts
```

Expected: 10 tests PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/lib/happy/utils.ts services/aris-web/tests/happyUtils.test.ts
git commit -m "feat: lib/happy/utils.ts — extractLastDirectoryName, resolveAgentFlavor 추출"
```

---

## Task 2: lib/happy/types.ts — 타입 추가

**Files:**
- Modify: `services/aris-web/lib/happy/types.ts`

- [ ] **Step 1: ChatSample, GlobalChatStats 타입 추가**

`lib/happy/types.ts` 끝에 추가:

```ts
export type ChatSample = {
  id: string;
  title: string;
  sessionId: string;
  sessionName: string;
  agent: AgentFlavor;
};

export type GlobalChatStats = {
  running: number;
  completed: number;
  agentDistribution: { claude: number; codex: number; gemini: number; unknown: number };
  runningSample: ChatSample[];
  completedSample: ChatSample[];
};
```

- [ ] **Step 2: SessionSummary에 chatAgentCounts, totalChats 추가**

`lib/happy/types.ts`의 `SessionSummary` 타입에 선택적 필드 추가:

```ts
export type SessionSummary = {
  id: string;
  agent: AgentFlavor;
  status: SessionStatus;
  lastActivityAt: string | null;
  model?: string | null;
  lastReadAt?: string | null;
  riskScore: number;
  projectName: string;
  approvalPolicy?: ApprovalPolicy;
  alias?: string | null;
  isPinned?: boolean;
  // 채팅 집계 (API route에서 주입, happy 서버에서 오지 않음)
  chatAgentCounts?: { claude: number; codex: number; gemini: number; unknown: number };
  totalChats?: number;
};
```

- [ ] **Step 3: TypeScript 타입 체크**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음 (또는 기존 에러만)

- [ ] **Step 4: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/lib/happy/types.ts
git commit -m "feat: ChatSample, GlobalChatStats 타입 추가; SessionSummary에 chatAgentCounts/totalChats 추가"
```

> 📝 **`normalizer.ts` 수정 불필요**: `chatAgentCounts`/`totalChats`는 happy 서버가 아닌 API route에서 DB를 직접 조회해 주입하므로 `lib/happy/normalizer.ts`는 건드리지 않는다.

---

## Task 3: lib/happy/client.ts — createSession agent optional

**Files:**
- Modify: `services/aris-web/lib/happy/client.ts:637-659`

- [ ] **Step 1: createSession input.agent를 optional로 변경**

`lib/happy/client.ts` L637~659 수정:

```ts
export async function createSession(input: {
  path: string;
  agent?: SessionSummary['agent'];  // optional — 미전달 시 'claude' 기본값
  approvalPolicy?: ApprovalPolicy;
  branch?: string;
}): Promise<SessionSummary> {
  const raw = await fetchHappy('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      path: input.path,
      flavor: input.agent ?? 'claude',  // 기본값 'claude'
      approvalPolicy: input.approvalPolicy ?? 'on-request',
      ...(input.branch ? { branch: input.branch } : {}),
    }),
  });

  const obj = asObject(raw);
  const session = obj?.session;
  if (!session) {
    throw new Error('백엔드 응답이 올바르지 않습니다.');
  }

  return normalizeSessions([session])[0];
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/lib/happy/client.ts
git commit -m "feat: createSession — agent 파라미터 optional로 변경 (기본값 claude)"
```

---

## Task 4: API Route POST — agent optional validation

**Files:**
- Modify: `services/aris-web/app/api/runtime/sessions/route.ts:56-92`

- [ ] **Step 1: POST 핸들러 수정**

`app/api/runtime/sessions/route.ts` POST 핸들러에서 L57~74 수정:

```ts
const body = await request.json();
const { path, agent, approvalPolicy, branch } = body as {
  path?: string;
  agent?: string;
  approvalPolicy?: string;
  branch?: string;
};
const normalizedPolicy = approvalPolicy === 'on-request'
  || approvalPolicy === 'on-failure'
  || approvalPolicy === 'never'
  || approvalPolicy === 'yolo'
  ? approvalPolicy
  : 'on-request';
const normalizedPath = typeof path === 'string' ? normalizeProjectPath(path) : '';

// agent 미전달 시 'claude' 기본값 (에러 반환하지 않음)
const normalizedAgent = agent === 'claude' || agent === 'codex' || agent === 'gemini'
  ? agent
  : 'claude';

if (!normalizedPath) {
  return NextResponse.json({ error: 'Path is required' }, { status: 400 });
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/app/api/runtime/sessions/route.ts
git commit -m "feat(api): POST /sessions — agent optional, 미전달 시 claude 기본값"
```

---

## Task 5: API Route GET — chatStats 집계 로직

**Files:**
- Modify: `services/aris-web/app/api/runtime/sessions/route.ts`
- Test: `services/aris-web/tests/chatStatsAggregation.test.ts`

> 집계 로직은 별도 헬퍼 함수로 추출하여 테스트 가능하게 한다.

- [ ] **Step 1: 집계 헬퍼 파일 생성 (실패하는 테스트 먼저)**

`services/aris-web/tests/chatStatsAggregation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSessionChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';

describe('buildSessionChatMeta', () => {
  it('집계된 groupBy 행을 세션별 chatAgentCounts Map으로 변환한다', () => {
    const rows = [
      { sessionId: 'session-1', agent: 'claude', _count: { id: 3 } },
      { sessionId: 'session-1', agent: 'codex', _count: { id: 2 } },
      { sessionId: 'session-2', agent: 'gemini', _count: { id: 1 } },
    ];

    const result = buildSessionChatMeta(rows);

    expect(result.get('session-1')).toEqual({ claude: 3, codex: 2, gemini: 0, unknown: 0, total: 5 });
    expect(result.get('session-2')).toEqual({ claude: 0, codex: 0, gemini: 1, unknown: 0, total: 1 });
  });

  it('알 수 없는 agent는 unknown으로 집계한다', () => {
    const rows = [
      { sessionId: 'session-1', agent: 'gpt-4', _count: { id: 2 } },
    ];
    const result = buildSessionChatMeta(rows);
    expect(result.get('session-1')).toEqual({ claude: 0, codex: 0, gemini: 0, unknown: 2, total: 2 });
  });

  it('빈 배열이면 빈 Map을 반환한다', () => {
    expect(buildSessionChatMeta([])).toEqual(new Map());
  });
});

describe('buildAgentDistribution', () => {
  it('groupBy 행에서 에이전트 분포 객체를 생성한다', () => {
    const rows = [
      { agent: 'claude', _count: { id: 5 } },
      { agent: 'codex', _count: { id: 3 } },
    ];
    expect(buildAgentDistribution(rows)).toEqual({ claude: 5, codex: 3, gemini: 0, unknown: 0 });
  });

  it('빈 배열이면 모두 0인 객체를 반환한다', () => {
    expect(buildAgentDistribution([])).toEqual({ claude: 0, codex: 0, gemini: 0, unknown: 0 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npm run test -- tests/chatStatsAggregation.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/happy/chatStatsHelpers'`

- [ ] **Step 3: chatStatsHelpers.ts 구현**

`services/aris-web/lib/happy/chatStatsHelpers.ts`:

```ts
import { resolveAgentFlavor } from '@/lib/happy/utils';

type GroupByRow = {
  sessionId?: string;
  agent: string;
  _count: { id: number };
};

type SessionChatCounts = {
  claude: number;
  codex: number;
  gemini: number;
  unknown: number;
  total: number;
};

type AgentDistribution = {
  claude: number;
  codex: number;
  gemini: number;
  unknown: number;
};

export function buildSessionChatMeta(
  rows: GroupByRow[],
): Map<string, SessionChatCounts> {
  const meta = new Map<string, SessionChatCounts>();

  for (const row of rows) {
    if (!row.sessionId) continue;
    const entry = meta.get(row.sessionId) ?? { claude: 0, codex: 0, gemini: 0, unknown: 0, total: 0 };
    const k = resolveAgentFlavor(row.agent);
    entry[k] += row._count.id;
    entry.total += row._count.id;
    meta.set(row.sessionId, entry);
  }

  return meta;
}

export function buildAgentDistribution(rows: GroupByRow[]): AgentDistribution {
  const dist: AgentDistribution = { claude: 0, codex: 0, gemini: 0, unknown: 0 };
  for (const row of rows) {
    const k = resolveAgentFlavor(row.agent);
    dist[k] += row._count.id;
  }
  return dist;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npm run test -- tests/chatStatsAggregation.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: API route GET 핸들러에 chatStats 집계 로직 추가**

`app/api/runtime/sessions/route.ts`의 GET 핸들러 수정.
`listSessions`, `syncWorkspacesForUser` 호출 이후 chatStats 집계를 추가:

```ts
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildSessionChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
import type { GlobalChatStats, ChatSample } from '@/lib/happy/types';

// GET 핸들러 내부, mergedSessions 생성 후:

const userId = auth.user.id;
const runningSessionIds = sessions.filter(s => s.status === 'running').map(s => s.id);

// running 채팅 집계
const runningCount = await prisma.sessionChat.count({
  where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId },
});
const runningSampleRows = await prisma.sessionChat.findMany({
  where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId },
  orderBy: { lastActivityAt: 'desc' },
  take: 3,
  select: { id: true, title: true, sessionId: true, agent: true },
});

// completed 채팅 집계
const completedNullCount = await prisma.sessionChat.count({
  where: { latestEventIsUser: false, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
});
const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
  SELECT COUNT(*)::bigint as count
  FROM "SessionChat"
  WHERE "userId" = ${userId}
    AND "latestEventIsUser" = false
    AND "sessionId" != ALL(${runningSessionIds}::text[])
    AND "lastReadAt" IS NOT NULL
    AND "lastActivityAt" > "lastReadAt"
`;
const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);

const completedNullSample = await prisma.sessionChat.findMany({
  where: { latestEventIsUser: false, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
  orderBy: { lastActivityAt: 'desc' }, take: 3,
  select: { id: true, title: true, sessionId: true, agent: true, lastActivityAt: true },
});
const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; sessionId: string; agent: string; lastActivityAt: Date }>>`
  SELECT id, title, "sessionId", agent, "lastActivityAt"
  FROM "SessionChat"
  WHERE "userId" = ${userId}
    AND "latestEventIsUser" = false
    AND "sessionId" != ALL(${runningSessionIds}::text[])
    AND "lastReadAt" IS NOT NULL
    AND "lastActivityAt" > "lastReadAt"
  ORDER BY "lastActivityAt" DESC
  LIMIT 3
`;
const completedSample = [...completedNullSample, ...completedNonNullSample]
  .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
  .slice(0, 3);

// 에이전트 분포
const agentGroupBy = await prisma.sessionChat.groupBy({
  by: ['agent'], where: { userId }, _count: { id: true },
});

// 세션별 채팅 에이전트 분포
const perSessionGroupBy = await prisma.sessionChat.groupBy({
  by: ['sessionId', 'agent'], where: { userId }, _count: { id: true },
});
const sessionChatMeta = buildSessionChatMeta(perSessionGroupBy);

// sessionName 맵 (alias 우선, 없으면 경로 마지막 세그먼트)
const sessionNameById = new Map(
  sessions.map(s => {
    const ws = workspaceMap.get(s.id);
    return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
  })
);

// sessions에 chatAgentCounts, totalChats 주입
const mergedSessions = sessions.map(s => {
  const meta = sessionChatMeta.get(s.id);
  const workspace = workspaceMap.get(s.id);
  return {
    ...s,
    alias: workspace?.alias ?? null,
    isPinned: workspace?.isPinned ?? false,
    lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
    chatAgentCounts: meta
      ? { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown }
      : undefined,
    totalChats: meta?.total,
  };
});

const toSample = (c: { id: string; title: string; sessionId: string; agent: string; lastActivityAt?: Date }): ChatSample => ({
  id: c.id,
  title: c.title || '(제목 없음)',
  sessionId: c.sessionId,
  sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
  agent: resolveAgentFlavor(c.agent),
});

const chatStats: GlobalChatStats = {
  running: runningCount,
  completed: completedCount,
  agentDistribution: buildAgentDistribution(agentGroupBy),
  runningSample: runningSampleRows.map(toSample),
  completedSample: completedSample.map(toSample),
};

return NextResponse.json({ sessions: mergedSessions, chatStats });
```

> 기존 `return NextResponse.json({ sessions: mergedSessions })` 를 위의 `return NextResponse.json({ sessions: mergedSessions, chatStats })` 로 교체.

- [ ] **Step 6: TypeScript 타입 체크**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 7: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/lib/happy/chatStatsHelpers.ts \
        services/aris-web/tests/chatStatsAggregation.test.ts \
        services/aris-web/app/api/runtime/sessions/route.ts
git commit -m "feat(api): GET /sessions — chatStats 채팅 집계 응답 추가"
```

---

## Task 6: SSE Stream Route — chatStats 10초 캐싱

**Files:**
- Modify: `services/aris-web/app/api/runtime/sessions/stream/route.ts`

- [ ] **Step 1: chatStats 집계 + 캐싱 로직 추가**

`stream/route.ts`의 `fetchAndSend` 클로저를 수정. 집계 관련 import 추가 후:

```ts
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildSessionChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
import type { GlobalChatStats, ChatSample } from '@/lib/happy/types';

// start() 클로저 상단에 캐시 변수 선언:
let cachedChatStats: GlobalChatStats | null = null;
// perSession 집계도 별도 캐싱 — 캐시 히트 시에도 sessionList에 주입 가능
let cachedSessionChatMeta: Map<string, { claude: number; codex: number; gemini: number; unknown: number; total: number }> | null = null;
let chatStatsCachedAt = 0;
const CHAT_STATS_TTL_MS = 10_000;

// fetchAndSend 내부 로직 수정:
const fetchAndSend = async () => {
  if (cancelled) return;
  try {
    const sessions = await listSessions();
    const workspaceMap = await syncWorkspacesForUser(userId, sessions);
    const sessionList = sessions.map((s) => {
      const workspace = workspaceMap.get(s.id);
      return {
        ...s,
        alias: workspace?.alias ?? null,
        isPinned: workspace?.isPinned ?? false,
        lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
        // chatAgentCounts, totalChats는 캐시된 perSession 데이터에서 나중에 주입
      };
    });

    // chatStats는 10초에 1회만 갱신
    const now = Date.now();
    if (!cachedChatStats || now - chatStatsCachedAt > CHAT_STATS_TTL_MS) {
      const runningSessionIds = sessions.filter(s => s.status === 'running').map(s => s.id);
      const runningCount = await prisma.sessionChat.count({
        where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId },
      });
      const runningSampleRows = await prisma.sessionChat.findMany({
        where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId },
        orderBy: { lastActivityAt: 'desc' }, take: 3,
        select: { id: true, title: true, sessionId: true, agent: true },
      });
      const completedNullCount = await prisma.sessionChat.count({
        where: { latestEventIsUser: false, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
      });
      const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint as count FROM "SessionChat"
        WHERE "userId" = ${userId}
          AND "latestEventIsUser" = false
          AND "sessionId" != ALL(${runningSessionIds}::text[])
          AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
      `;
      const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);
      const completedNullSample = await prisma.sessionChat.findMany({
        where: { latestEventIsUser: false, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
        orderBy: { lastActivityAt: 'desc' }, take: 3,
        select: { id: true, title: true, sessionId: true, agent: true, lastActivityAt: true },
      });
      const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; sessionId: string; agent: string; lastActivityAt: Date }>>`
        SELECT id, title, "sessionId", agent, "lastActivityAt" FROM "SessionChat"
        WHERE "userId" = ${userId} AND "latestEventIsUser" = false
          AND "sessionId" != ALL(${runningSessionIds}::text[])
          AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
        ORDER BY "lastActivityAt" DESC LIMIT 3
      `;
      const completedSample = [...completedNullSample, ...completedNonNullSample]
        .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
        .slice(0, 3);
      const agentGroupBy = await prisma.sessionChat.groupBy({ by: ['agent'], where: { userId }, _count: { id: true } });
      const perSessionGroupBy = await prisma.sessionChat.groupBy({ by: ['sessionId', 'agent'], where: { userId }, _count: { id: true } });
      const sessionChatMeta = buildSessionChatMeta(perSessionGroupBy);
      const sessionNameById = new Map(sessions.map(s => {
        const ws = workspaceMap.get(s.id);
        return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
      }));
      const toSample = (c: { id: string; title: string; sessionId: string; agent: string }): ChatSample => ({
        id: c.id, title: c.title || '(제목 없음)',
        sessionId: c.sessionId, sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
        agent: resolveAgentFlavor(c.agent),
      });
      cachedSessionChatMeta = sessionChatMeta;  // 캐시 저장 — 캐시 히트 시에도 재사용
      cachedChatStats = {
        running: runningCount, completed: completedCount,
        agentDistribution: buildAgentDistribution(agentGroupBy),
        runningSample: runningSampleRows.map(toSample),
        completedSample: completedSample.map(toSample),
      };
      chatStatsCachedAt = now;
    }

    // 캐시 히트/미스 상관없이 항상 sessionList에 chatAgentCounts/totalChats 주입
    if (cachedSessionChatMeta) {
      for (const s of sessionList) {
        const meta = cachedSessionChatMeta.get(s.id);
        if (meta) {
          (s as typeof s & { chatAgentCounts?: object; totalChats?: number }).chatAgentCounts =
            { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown };
          (s as typeof s & { totalChats?: number }).totalChats = meta.total;
        }
      }
    }

    send({ sessions: sessionList, chatStats: cachedChatStats });
  } catch {
    // 무시 — 다음 주기에 재시도
  }
};
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/app/api/runtime/sessions/stream/route.ts
git commit -m "feat(stream): SSE에 chatStats 추가 (10초 캐싱)"
```

---

## Task 7: SessionDashboard.tsx — 모달 간소화

**Files:**
- Modify: `services/aris-web/app/SessionDashboard.tsx`

모달 관련 변경만 이 태스크에서 수행. 통계/카드 변경은 다음 태스크에서 처리.

- [ ] **Step 1: 불필요한 state 및 타입 제거**

`SessionDashboard.tsx` 상단의 지역 `AgentFlavor` 타입 재정의(L20) 제거 → `lib/happy/types.ts` import에 `AgentFlavor` 추가.

제거할 state:
- `newAgent`, `newApprovalPolicy` (`useState` 선언 제거)

제거할 타입/상수:
- `APPROVAL_POLICY_OPTIONS` 배열 제거
- `isAgentFlavor`, `resolveAgent` 함수 제거 (대신 `lib/happy/utils.ts`의 `resolveAgentFlavor` import)
- `isSessionApprovalPolicy`, `resolveSessionApprovalPolicy` 함수 제거 (모달에서만 사용)

> ⚠️ **`AgentOption` 타입, `AGENT_OPTIONS` 배열, `getAgentOption` 함수는 이 단계에서 제거하지 않는다.** 워크스페이스 카드 body(L1609)에서 여전히 사용 중이므로 **Task 9 Step 2에서 카드 body 교체 후 함께 제거**한다.

`extractLastDirectoryName` 지역 정의(L166~172) 제거 → `lib/happy/utils.ts`에서 import.

`PathHistoryEntry` 타입을 다음으로 교체:
```ts
type PathHistoryEntry = {
  path: string;
  lastUsedAt: string;
  sessionId?: string;
};
```

- [ ] **Step 2: createSession 래퍼 수정**

`createSession` 함수 시그니처를 다음으로 변경:
```ts
async function createSession(pathInput: string, branchInput: string)
```

내부 fetch body:
```ts
body: JSON.stringify({ path, ...(branch ? { branch } : {}) })
```

`handleCreateSession` 수정:
```ts
await createSession(newPath, newBranch);
```

`openCreateSessionModal` 수정 — `setNewApprovalPolicy` 호출 제거:
```ts
function openCreateSessionModal() {
  setError(null);
  setNewPath('');
  setNewBranch('');
  setIsBrowsing(true);
  setBrowserPath('/');
  setDirectories([]);
  setParentPath(null);
  setIsBrowserPathEditing(false);
  setBrowserPathDraft(WORKSPACE_PATH_ROOT);
  setIsCreateModalOpen(true);
}
```

- [ ] **Step 3: recordHistory, handleQuickResume, applyHistory 수정**

`recordHistory(path, agent, approvalPolicy, sessionId)` → `recordHistory(path, sessionId?)`:
```ts
function recordHistory(pathInput: string, sessionId?: string) {
  const path = sanitizePath(pathInput);
  if (!path) return;
  setPathHistory((prev) => {
    const next = [
      { path, lastUsedAt: new Date().toISOString(), sessionId },
      ...prev.filter((item) => item.path !== path),
    ];
    return next.slice(0, MAX_PATH_HISTORY_ITEMS);
  });
}
```

`handleQuickResume` 수정:
```ts
async function handleQuickResume(entry: PathHistoryEntry) {
  if (!isOperator || isCreating) return;
  if (entry.sessionId && sessionsList.some((s) => s.id === entry.sessionId)) {
    recordHistory(entry.path, entry.sessionId);
    router.push(`/sessions/${entry.sessionId}`);
    return;
  }
  await createSession(entry.path, '');
}
```

`applyHistory` 수정 — agent/policy 제거, path와 error만 처리:
```ts
function applyHistory(entry: PathHistoryEntry) {
  setNewPath(entry.path);
  setError(null);
}
```

- [ ] **Step 4: 로컬스토리지 파싱 수정 (useEffect L460~468)**

```ts
const parsed = JSON.parse(savedHist);
if (Array.isArray(parsed)) {
  setPathHistory(parsed.map(item => ({
    path: String(item.path || ''),
    lastUsedAt: normalizeDate(item.lastUsedAt),
    sessionId: item.sessionId ? String(item.sessionId) : undefined,
    // agent, approvalPolicy 필드는 무시 (하위 호환성)
  })));
}
```

- [ ] **Step 5: 모달 JSX 수정**

모달 `form` 내부에서 다음 섹션 제거:
- 에이전트 선택 `<div className="form-section">` (AGENT_OPTIONS grid 전체)
- 승인 정책 선택 `<div className="form-section">` (APPROVAL_POLICY_OPTIONS grid 전체)

모달 subtitle 변경:
```tsx
<p className="modal-subtitle">프로젝트 경로를 선택하여 시작하세요.</p>
```

'이 경로 선택' 버튼 위치 이동 — `browser-header`에서 `browser-list` 아래로:
- `browser-header`에서 `<Button ... className="select-current-btn">` 제거
- `browser-list` div 닫는 태그 이후에 추가:

```tsx
</div>  {/* browser-list 끝 */}
<Button
  type="button"
  variant="primary"
  className="select-current-btn"
  onClick={() => {
    setNewPath(buildWorkspacePath(browserPath));
    setIsBrowserPathEditing(false);
  }}
>
  <Check size={14} /> 이 경로 선택
</Button>
```

history 카드에서 에이전트/정책 표시 제거:
```tsx
<button
  type="button"
  className={`history-info-btn ${sanitizePath(newPath) === entry.path ? 'selected' : ''}`}
  onClick={() => applyHistory(entry)}
>
  <span className="path-text">{entry.path}</span>
  <div className="meta-row">
    <span className="meta-item">
      <Clock3 size={12} /> {formatHistoryDate(entry.lastUsedAt)}
    </span>
  </div>
</button>
```

- [ ] **Step 6: TypeScript 타입 체크 + 전체 테스트 실행**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -40
npm run test 2>&1 | tail -20
```

Expected: 타입 에러 없음, 기존 테스트 모두 PASS

- [ ] **Step 7: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/app/SessionDashboard.tsx
git commit -m "feat(dashboard): 새 워크스페이스 모달 간소화 — 에이전트/정책 선택 제거"
```

---

## Task 8: SessionDashboard.tsx — chatStats state 및 통계 카드 변경

**Files:**
- Modify: `services/aris-web/app/SessionDashboard.tsx`

- [ ] **Step 1: chatStats state 추가**

`SessionDashboard` 컴포넌트 상단에 state 추가:
```ts
import type { GlobalChatStats } from '@/lib/happy/types';

const [chatStats, setChatStats] = useState<GlobalChatStats | null>(null);
const [pendingChatIds, setPendingChatIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: 폴링 로직 수정 — chatStats 수신**

기존 세션 폴링 `useEffect` 수정 (REST 폴링):
```ts
const data = (await res.json()) as { sessions?: SessionSummary[]; chatStats?: GlobalChatStats };
if (disposed || !data.sessions) return;
setSessionsList(data.sessions);
if (data.chatStats) setChatStats(data.chatStats);
```

기존 SSE `useEffect` 수정:
```ts
const data = JSON.parse(event.data as string) as { sessions?: SessionSummary[]; chatStats?: GlobalChatStats };
if (!Array.isArray(data.sessions)) return;
setSessionsList(data.sessions);
if (data.chatStats) setChatStats(data.chatStats);
// ... 기존 pins/aliases 처리 유지
```

- [ ] **Step 3: permissions 폴링 수정 — pendingChatIds 추출**

기존 permissions 폴링 `useEffect`에서 응답 타입 캐스팅 수정:
```ts
const body = (await response.json().catch(() => ({}))) as {
  permissions?: Array<{ sessionId?: string; chatId?: string | null }>;
};
```

Set 구성 로직 추가:
```ts
const nextSessionIds = new Set<string>();
const nextChatIds = new Set<string>();
body.permissions.forEach((permission) => {
  if (typeof permission?.sessionId === 'string' && permission.sessionId.trim()) {
    nextSessionIds.add(permission.sessionId);
  }
  if (typeof permission?.chatId === 'string' && permission.chatId.trim()) {
    nextChatIds.add(permission.chatId);
  }
});
setPendingPermissionSessionIds(nextSessionIds);
setPendingChatIds(nextChatIds);
```

- [ ] **Step 4: 통계 카드 바 차트 수정**

`sessionStats` useMemo는 유지 (워크스페이스 카드 배지용). 통계 카드 렌더링에서만 chatStats 기반 값 사용.

통계 카드 렌더 직전 컴포넌트 본문(`return` 이전)에 변수 추가:
```ts
// return 이전, 통계 카드 렌더 변수 (JSX 내부에 const 선언 불가)
const chatRunning = chatStats?.running ?? 0;
const chatPending = pendingChatIds.size;
const chatCompleted = chatStats?.completed ?? 0;
const chatTotal = chatRunning + chatPending + chatCompleted;
```

통계 카드 JSX 교체 (변수는 위에서 선언했으므로 여기서는 참조만):
```tsx
{/* 바 차트 — idle 세그먼트 없음 */}
<div className={styles.sessionSummaryBarChart} role="img" aria-label="채팅 상태 요약">
  {chatTotal > 0 ? (
    <>
      <div style={{ width: `${(chatRunning / chatTotal) * 100}%`, backgroundColor: SESSION_UI_STATUS_META.running.color }} className={styles.sessionBarSegment} />
      <div style={{ width: `${(chatPending / chatTotal) * 100}%`, backgroundColor: SESSION_UI_STATUS_META.pending.color }} className={styles.sessionBarSegment} />
      <div style={{ width: `${(chatCompleted / chatTotal) * 100}%`, backgroundColor: SESSION_UI_STATUS_META.completed.color }} className={styles.sessionBarSegment} />
    </>
  ) : null}
</div>

{/* 레전드 — idle 없음 */}
<div className={styles.sessionSummaryLegend}>
  {[
    { status: 'running' as const, count: chatRunning },
    { status: 'pending' as const, count: chatPending },
    { status: 'completed' as const, count: chatCompleted },
  ].map(({ status, count }) => (
    <div key={status} className={styles.sessionSummaryLegendItem}>
      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: SESSION_UI_STATUS_META[status].color }} />
      <span>{SESSION_UI_STATUS_META[status].label}</span>
      <strong>{count}</strong>
    </div>
  ))}
</div>
```

- [ ] **Step 5: 리스트 섹션 수정 — 채팅 단위**

'진행 중인 워크스페이스' 섹션:
```tsx
<h4 className={styles.sessionStatusSubTitle}>진행 중인 채팅</h4>
{chatStats && chatStats.runningSample.length > 0 ? (
  <div className={styles.sessionMiniList}>
    {chatStats.runningSample.map(chat => (
      <div key={chat.id} className={styles.sessionMiniItem}>
        <span className={styles.sessionMiniStatusDot} style={{ backgroundColor: 'var(--chart-status-running)' }} />
        <span className={styles.sessionMiniName}>{chat.title}</span>
        <span className={styles.sessionMiniSubName}>{chat.sessionName}</span>
      </div>
    ))}
  </div>
) : <p className={styles.sessionEmptyHint}>없음</p>}
```

'최근 완료' 섹션도 동일하게 `chatStats.completedSample` 사용.

- [ ] **Step 6: 에이전트 분포 카드 수정**

도넛 데이터 변경:
```ts
const chatAgentDistData = chatStats
  ? AGENT_OPTIONS.map(agent => ({
      name: agent.label,
      value: chatStats.agentDistribution[agent.id as 'claude' | 'codex' | 'gemini'] ?? 0,
      color: agent.accentColor,
    })).filter(e => e.value > 0)
  : [];
const agentDistributionData = chatAgentDistData.length > 0
  ? chatAgentDistData
  : [{ name: '없음', value: 1, color: 'var(--chart-track)' }];

const totalChatCount = chatStats
  ? Object.values(chatStats.agentDistribution).reduce((a, b) => a + b, 0)
  : 0;
```

도넛 중앙 수치/레이블:
```tsx
<div className={styles.agentDonutValue}>{totalChatCount}</div>
<div className={styles.agentDonutLabel}>chats</div>
```

카드 타이틀:
```tsx
<h4 className={styles.sessionSidebarTitle}>채팅 에이전트 분포</h4>
```

레전드:
```tsx
{AGENT_OPTIONS.map((agent) => (
  <div key={agent.id} className={styles.agentSummaryLegendItem}>
    <div className={styles.agentSummaryLegendInfo}>
      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: agent.accentColor }} />
      <span>{agent.label}</span>
    </div>
    <strong>{chatStats?.agentDistribution[agent.id as 'claude' | 'codex' | 'gemini'] ?? 0}</strong>
  </div>
))}
```

- [ ] **Step 7: `agentStats` useMemo 제거**

기존 `agentStats` useMemo는 워크스페이스 단위 에이전트 통계용이었으나 `chatStats.agentDistribution`으로 대체되었다.
`agentStats`를 참조하는 모든 코드를 삭제 또는 `chatStats.agentDistribution` 참조로 교체한다.

- [ ] **Step 8: TypeScript 타입 체크 + 테스트**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -40
npm run test 2>&1 | tail -20
```

- [ ] **Step 9: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/app/SessionDashboard.tsx
git commit -m "feat(dashboard): 통계 카드 + 에이전트 분포 카드 — 채팅 단위로 변경"
```

---

## Task 9: SessionDashboard.tsx — 워크스페이스 카드 body 변경

**Files:**
- Modify: `services/aris-web/app/SessionDashboard.tsx`
- Modify: `services/aris-web/app/SessionDashboard.module.css`

- [ ] **Step 1: `getAgentOption` 제거 + `AgentOption` 타입 간소화**

Task 7에서 `AGENT_OPTIONS`, `AgentOption`, `getAgentOption`을 보존했으므로 이 단계에서 정리한다.

1. `getAgentOption` 함수 전체 삭제 (이 함수만 `AgentOption.subtitle`을 참조하므로 삭제 후 타입 간소화 가능)

2. `AgentOption` 타입을 아래로 교체 (`subtitle` 필드 제거):

```ts
type AgentOption = {
  id: 'claude' | 'codex' | 'gemini';
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  accentColor: string;
  accentBg: string;
};
```

3. `AGENT_OPTIONS`는 그대로 유지 — Step 2의 새 카드 body에서 사용.

- [ ] **Step 2: 워크스페이스 카드 body JSX 교체**

기존 `sessionCardBody`:
```tsx
<div className={styles.sessionCardBody}>
  <div className={styles.sessionCardAgent} style={{ color: agentInfo.accentColor }}>
    <div className={styles.sessionCardAgentIcon} style={{ backgroundColor: agentInfo.accentBg }}>
      <AgentIcon size={18} />
    </div>
    {agentInfo.label}
  </div>
  <div>
    <Badge variant={sessionUiStatusMeta.variant}>
      {sessionUiStatusMeta.label}
    </Badge>
  </div>
</div>
```

교체:
```tsx
<div className={styles.sessionCardBody}>
  {/* 에이전트 분포 영역 */}
  {session.totalChats && session.totalChats > 0 && session.chatAgentCounts ? (
    <div className={styles.chatAgentDistribution}>
      {/* 수평 바 차트 */}
      <div className={styles.chatAgentBar}>
        {AGENT_OPTIONS
          .filter(a => (session.chatAgentCounts?.[a.id] ?? 0) > 0)
          .map(a => (
            <div
              key={a.id}
              className={styles.chatAgentBarSegment}
              style={{
                width: `${((session.chatAgentCounts?.[a.id] ?? 0) / session.totalChats!) * 100}%`,
                backgroundColor: a.accentColor,
              }}
            />
          ))
        }
      </div>
      {/* 겹침 아이콘 그룹 */}
      <div className={styles.agentAvatarStack}>
        {AGENT_OPTIONS
          .filter(a => (session.chatAgentCounts?.[a.id] ?? 0) > 0)
          .sort((a, b) => (session.chatAgentCounts?.[b.id] ?? 0) - (session.chatAgentCounts?.[a.id] ?? 0))
          .map((a, idx) => {
            const AIcon = a.Icon;
            return (
              <div
                key={a.id}
                className={styles.agentAvatarItem}
                style={{
                  backgroundColor: a.accentBg,
                  color: a.accentColor,
                  zIndex: AGENT_OPTIONS.length - idx,
                  marginLeft: idx === 0 ? 0 : -8,
                }}
                title={a.label}
              >
                <AIcon size={14} />
              </div>
            );
          })
        }
      </div>
    </div>
  ) : (
    <span className={styles.chatAgentEmpty}>채팅 없음</span>
  )}
  {/* 상태 배지 */}
  <div>
    <Badge variant={sessionUiStatusMeta.variant}>
      {sessionUiStatusMeta.label}
    </Badge>
  </div>
</div>
```

- [ ] **Step 3: CSS 스타일 추가**

`SessionDashboard.module.css` 끝에 추가:

```css
/* 워크스페이스 카드 에이전트 분포 */
.chatAgentDistribution {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.chatAgentBar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background-color: var(--dashboard-surface-track);
}

.chatAgentBarSegment {
  height: 100%;
  transition: width 0.3s ease;
}

.agentAvatarStack {
  display: flex;
  align-items: center;
}

.agentAvatarItem {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--surface-base, #fff);
  flex-shrink: 0;
}

.chatAgentEmpty {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex: 1;
}
```

- [ ] **Step 4: TypeScript 타입 체크 + 전체 테스트**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit 2>&1 | head -40
npm run test 2>&1 | tail -20
```

Expected: 타입 에러 없음, 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git add services/aris-web/app/SessionDashboard.tsx \
        services/aris-web/app/SessionDashboard.module.css
git commit -m "feat(dashboard): 워크스페이스 카드 — 에이전트 분포 바 차트 + 겹침 아이콘 표시"
```

---

## Task 10: 전체 테스트 + 빌드 확인 + PR

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npm run test
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 전체 빌드 확인**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign/services/aris-web
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 최종 push**

```bash
cd /home/ubuntu/aris-dashboard-chat-redesign
git push -u origin feat/dashboard-chat-redesign
```

- [ ] **Step 4: PR 생성**

```bash
gh pr create \
  --title "feat: 메인 대시보드 워크스페이스→채팅 단위 재설계" \
  --body "$(cat <<'EOF'
## Summary
- 새 워크스페이스 모달에서 에이전트/승인 정책 선택 제거 (경로 선택기만 유지)
- API `/api/runtime/sessions` GET에 채팅 집계 데이터(`chatStats`) 추가
- 워크스페이스 현황 카드 → 채팅 단위 (실행 중/대기/완료, idle 제거)
- 에이전트 분포 카드 → 채팅 단위로 변경 ('채팅 에이전트 분포')
- 워크스페이스 카드 body → 수평 바 차트 + 겹침 아이콘 그룹으로 변경

## Test plan
- [ ] 새 워크스페이스 모달 열기 → 경로 선택기와 최근 경로 목록만 표시 확인
- [ ] '이 경로 선택' 버튼 위치 브라우저 리스트 아래 확인
- [ ] 워크스페이스가 있을 때 통계 카드에서 채팅 단위 수치 표시 확인
- [ ] 워크스페이스 카드에 에이전트 바 차트 + 아이콘 표시 확인
- [ ] TypeScript 빌드 통과 확인
EOF
)"
```

- [ ] **Step 5: PR 머지 (사용자 확인 후)**

머지 전 반드시 사용자에게 확인 요청.

```bash
gh pr merge --squash
```

- [ ] **Step 6: 배포 확인**

```bash
# GitHub Actions 진행 상황 확인
gh run list --limit 5
gh run watch  # 가장 최근 run 모니터링
```

Expected: deploy job 성공

- [ ] **Step 7: Worktree 정리**

```bash
cd /home/ubuntu/project/ARIS
git worktree remove ../aris-dashboard-chat-redesign
git branch -d feat/dashboard-chat-redesign
git push origin --delete feat/dashboard-chat-redesign
```

---

## 참고: 주요 파일 경로 요약

```
services/aris-web/
├── lib/happy/
│   ├── types.ts              ChatSample, GlobalChatStats 추가; SessionSummary 확장
│   ├── utils.ts              [신규] extractLastDirectoryName, resolveAgentFlavor
│   ├── chatStatsHelpers.ts   [신규] buildSessionChatMeta, buildAgentDistribution
│   └── client.ts             createSession agent optional
├── app/
│   ├── api/runtime/sessions/
│   │   ├── route.ts          POST: agent optional; GET: chatStats 집계
│   │   └── stream/route.ts   chatStats 10초 캐싱
│   ├── SessionDashboard.tsx  모달/통계카드/분포카드/워크스페이스카드 변경
│   └── SessionDashboard.module.css  chatAgentBar, agentAvatarStack 스타일
└── tests/
    ├── happyUtils.test.ts         [신규]
    └── chatStatsAggregation.test.ts [신규]
```
