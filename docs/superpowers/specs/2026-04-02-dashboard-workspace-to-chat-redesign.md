# 메인 대시보드 워크스페이스→채팅 단위 재설계

**날짜**: 2026-04-02  
**범위**: `services/aris-web/`  
**관련 파일**: `app/SessionDashboard.tsx`, `app/api/runtime/sessions/route.ts`, `app/api/runtime/sessions/stream/route.ts`, `lib/happy/types.ts`, `lib/happy/client.ts`

---

## 배경

기존 아키텍처에서는 워크스페이스(세션) 1개 = 에이전트 1종 이었다. 이후 한 워크스페이스에 여러 에이전트가 공존하는 채팅 기반 구조로 전환되었으나, 메인 대시보드 UI가 이전 개념에 머물러 있다. 이를 채팅 단위 개념으로 정렬한다.

---

## 변경 범위

### 1. 새 워크스페이스 모달 간소화

**제거**:
- 에이전트 선택 섹션 (`AGENT_OPTIONS` grid)
- 승인 정책 선택 섹션 (`APPROVAL_POLICY_OPTIONS` grid)
- 관련 state: `newAgent`, `newApprovalPolicy`

**유지**:
- 경로 브라우저 (directory browser)
- 최근 경로 목록 (단, 에이전트/정책 메타 표시 제거)
- 브랜치 입력 (선택)

**레이아웃 조정**:
- '이 경로 선택' 버튼을 `browser-header` 오른쪽 → **`browser-list` div 바로 아래**로 이동

#### 1-a. `lib/happy/client.ts` `createSession` 수정 (L637)

`agent` 필드를 optional로, 미전달 시 `'claude'` 기본값 적용:
```ts
export async function createSession(input: {
  path: string;
  agent?: SessionSummary['agent'];  // optional, 기본값 'claude'
  approvalPolicy?: ApprovalPolicy;
  branch?: string;
}): Promise<SessionSummary>
// 내부: flavor: input.agent ?? 'claude'
```

#### 1-b. `app/api/runtime/sessions/route.ts` POST 핸들러 수정 (L71~74)

```ts
// 변경 후
const normalizedAgent = agent === 'claude' || agent === 'codex' || agent === 'gemini'
  ? agent : 'claude';  // 미전달 시 기본값
// approvalPolicy는 미전달 시 기존대로 'on-request' 기본값 유지 (의도된 동작)
if (!normalizedPath) {
  return NextResponse.json({ error: 'Path is required' }, { status: 400 });
}
```

#### 1-c. `SessionDashboard.tsx` 내부 `createSession` 래퍼 수정

```ts
// 변경 후 시그니처
async function createSession(pathInput: string, branchInput: string)
// 내부: fetch('/api/runtime/sessions', { body: JSON.stringify({ path, branch }) })
// agent/approvalPolicy 미전달 → 서버에서 기본값 처리
```

**`handleCreateSession(e: React.FormEvent)` 수정**:
- `await createSession(newPath, newAgent, newApprovalPolicy, newBranch)` → `await createSession(newPath, newBranch)`

**`openCreateSessionModal()` 수정**:
- `setNewApprovalPolicy('on-request')` 제거

#### 1-d. `PathHistoryEntry` 타입 및 파급 함수 처리

```ts
// 변경 후
type PathHistoryEntry = { path: string; lastUsedAt: string; sessionId?: string; }
```

파급 변경:
- `recordHistory(path, agent, approvalPolicy, sessionId)` → `recordHistory(path, sessionId?)`
- `handleQuickResume(entry)`:
  - `recordHistory(entry.path, entry.agent, entry.approvalPolicy, entry.sessionId)` → `recordHistory(entry.path, entry.sessionId)`
  - `createSession(entry.path, entry.agent, entry.approvalPolicy, '')` → `createSession(entry.path, '')`
- `applyHistory(entry)`: `setNewAgent`, `setNewApprovalPolicy` 제거. `setError(null)`, `setNewPath(entry.path)` 유지.
- 로컬스토리지 파싱 (`useEffect` L460~468): `path`, `lastUsedAt`, `sessionId`만 추출 (기존 `agent`, `approvalPolicy` 무시).

최근 경로 카드 (`history-card`) UI:
- 에이전트 아이콘/라벨/정책 표시 제거 → 경로 + 시간(`Clock3` + `formatHistoryDate`) 만 표시
- `getAgentOption`, `AgentIcon` 관련 코드 제거

---

### 2. API 응답 확장 — 채팅 집계 데이터

#### 2-a. 유틸 함수 추출

`extractLastDirectoryName` 함수를 **`lib/happy/utils.ts`** 로 추출 (새 파일 생성). 현재 `SessionDashboard.tsx`의 구현을 그대로 이동. API route와 프론트엔드 양쪽에서 import해서 사용.

#### 2-b. 신규 타입 (`lib/happy/types.ts`)

```ts
export type ChatSample = {
  id: string;
  title: string;       // 빈 문자열인 경우 UI에서 '(제목 없음)' fallback 표시
  sessionId: string;
  sessionName: string; // workspaceMap.alias || extractLastDirectoryName(session.projectName)
  agent: AgentFlavor;  // lib/happy/types.ts의 AgentFlavor 사용 ('claude'|'codex'|'gemini'|'unknown')
};

export type GlobalChatStats = {
  running: number;        // 에이전트가 동작 중인 채팅 수 (정확한 count)
  completed: number;      // 미확인 완료 채팅 수 (정확한 count)
  agentDistribution: { claude: number; codex: number; gemini: number; unknown: number };
  runningSample: ChatSample[];   // 최대 3개
  completedSample: ChatSample[]; // 최대 3개, lastActivityAt 내림차순
};
```

#### 2-c. `SessionSummary` 타입 확장 (`lib/happy/types.ts`)

```ts
chatAgentCounts?: { claude: number; codex: number; gemini: number; unknown: number };
totalChats?: number;
```

`lib/happy/normalizer.ts`: optional 신규 필드는 normalizer를 통과할 때 그대로 전달되므로 별도 수정 불필요. (normalizer가 spread 방식을 쓰는 경우) 단, normalizer가 명시적 필드 목록으로 변환하는 경우 `chatAgentCounts`, `totalChats` 필드를 pass-through에 추가.

#### 2-d. API 응답 구조

`GET /api/runtime/sessions`:
```json
{
  "sessions": [ ...SessionSummary... ],
  "chatStats": { ...GlobalChatStats... }
}
```

SSE (`GET /api/runtime/sessions/stream`): 동일 구조.  
SSE 성능: `chatStats` 집계는 **10초에 1회**만 갱신 (세션 목록은 기존대로 2초). 집계 결과를 클로저 변수에 캐싱하고, 카운터로 주기를 제어.

#### 2-e. 채팅 집계 로직 (서버 side)

집계 범위: 현재 로그인 유저(`auth.user.id`)의 채팅만.

```ts
import { extractLastDirectoryName } from '@/lib/happy/utils';

// Step 1: running 세션 ID 추출 (happy 서버 결과 재사용)
const runningSessionIds = sessions.filter(s => s.status === 'running').map(s => s.id);

// Step 2: running 채팅 — count + sample 분리
const runningCount = await prisma.sessionChat.count({
  where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId: auth.user.id },
});
const runningSample = await prisma.sessionChat.findMany({
  where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, userId: auth.user.id },
  orderBy: { lastActivityAt: 'desc' },
  take: 3,
  select: { id: true, title: true, sessionId: true, agent: true },
});

// Step 3: completed 채팅 — count + sample 분리
// (a) lastReadAt이 null인 경우 → Prisma where로 처리
// (b) lastReadAt이 non-null이고 lastActivityAt > lastReadAt → raw SQL
// 두 쿼리 결과를 합산하여 정확한 count 산출
const completedNullCount = await prisma.sessionChat.count({
  where: { latestEventIsUser: false, userId: auth.user.id, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
});
// lastReadAt non-null 미읽음: raw query로 count
const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
  SELECT COUNT(*)::bigint as count
  FROM "SessionChat"
  WHERE "userId" = ${auth.user.id}
    AND "latestEventIsUser" = false
    AND "sessionId" != ALL(${runningSessionIds})
    AND "lastReadAt" IS NOT NULL
    AND "lastActivityAt" > "lastReadAt"
`;
const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);

// sample은 별도 findMany (null + non-null을 정렬해서 3개)
const completedNullSample = await prisma.sessionChat.findMany({
  where: { latestEventIsUser: false, userId: auth.user.id, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
  orderBy: { lastActivityAt: 'desc' }, take: 3,
  select: { id: true, title: true, sessionId: true, agent: true, lastActivityAt: true },
});
const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; sessionId: string; agent: string; lastActivityAt: Date }>>`
  SELECT id, title, "sessionId", agent, "lastActivityAt"
  FROM "SessionChat"
  WHERE "userId" = ${auth.user.id}
    AND "latestEventIsUser" = false
    AND "sessionId" != ALL(${runningSessionIds})
    AND "lastReadAt" IS NOT NULL
    AND "lastActivityAt" > "lastReadAt"
  ORDER BY "lastActivityAt" DESC
  LIMIT 3
`;
// 두 배열 병합 후 lastActivityAt 내림차순 정렬, 3개만 취득
const completedSample = [...completedNullSample, ...completedNonNullSample]
  .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
  .slice(0, 3);

// Step 4: 에이전트 분포
const agentGroupBy = await prisma.sessionChat.groupBy({
  by: ['agent'], where: { userId: auth.user.id }, _count: { id: true },
});

// Step 5: 세션별 채팅 에이전트 분포
const perSessionGroupBy = await prisma.sessionChat.groupBy({
  by: ['sessionId', 'agent'], where: { userId: auth.user.id }, _count: { id: true },
});

// Step 6: perSessionGroupBy → sessionChatMeta Map
const sessionChatMeta = new Map<string, { claude: number; codex: number; gemini: number; unknown: number; total: number }>();
for (const row of perSessionGroupBy) {
  const entry = sessionChatMeta.get(row.sessionId) ?? { claude: 0, codex: 0, gemini: 0, unknown: 0, total: 0 };
  const k = (row.agent === 'claude' || row.agent === 'codex' || row.agent === 'gemini') ? row.agent : 'unknown';
  entry[k] += row._count.id;
  entry.total += row._count.id;
  sessionChatMeta.set(row.sessionId, entry);
}

// Step 7: sessions에 chatAgentCounts, totalChats 주입
const mergedSessions = sessions.map(s => {
  const meta = sessionChatMeta.get(s.id);
  const workspace = workspaceMap.get(s.id);
  return {
    ...s,
    alias: workspace?.alias ?? null,
    isPinned: workspace?.isPinned ?? false,
    lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
    chatAgentCounts: meta ? { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown } : undefined,
    totalChats: meta?.total,
  };
});

// Step 8: sessionName 맵
const sessionNameById = new Map(sessions.map(s => {
  const ws = workspaceMap.get(s.id);
  return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
}));

// Step 9: resolveAgentFlavor 헬퍼 (lib/happy/utils.ts에 추가)
// function resolveAgentFlavor(agent: string): AgentFlavor
// { 'claude'|'codex'|'gemini' → 그대로, 나머지 → 'unknown' }

// Step 10: GlobalChatStats 조립
const agentDist = { claude: 0, codex: 0, gemini: 0, unknown: 0 };
for (const row of agentGroupBy) {
  const k = (row.agent === 'claude' || row.agent === 'codex' || row.agent === 'gemini') ? row.agent : 'unknown';
  agentDist[k] = row._count.id;
}

const chatStats: GlobalChatStats = {
  running: runningCount,
  completed: completedCount,
  agentDistribution: agentDist,
  runningSample: runningSample.map(c => ({
    id: c.id,
    title: c.title || '(제목 없음)',
    sessionId: c.sessionId,
    sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
    agent: resolveAgentFlavor(c.agent),
  })),
  completedSample: completedSample.map(c => ({
    id: c.id,
    title: c.title || '(제목 없음)',
    sessionId: c.sessionId,
    sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
    agent: resolveAgentFlavor(c.agent),
  })),
};
```

---

### 3. 워크스페이스 현황 카드 변경

**상태 통계는 채팅 단위로 변경**:

수치 계산:
- `running`: `chatStats.running`
- `completed`: `chatStats.completed`
- `pending`: permissions 폴링 결과에서 **고유 chatId 집합의 크기**
  - 폴링 결과 타입 캐스팅 수정: `{ permissions?: Array<{ sessionId?: string; chatId?: string | null }> }` (기존에 chatId 누락)
  - `pendingChatIds = new Set(permissions.filter(p => p.chatId).map(p => p.chatId!))`
  - 통계 카드용: `pendingChatIds.size`
  - `pendingPermissionSessionIds` 는 워크스페이스 카드 배지(`resolveSessionUiStatus`)용으로 유지
  - chatId 없는 permission은 채팅 단위 집계에서 제외 (의도된 동작)
- total(바 차트 분모): `running + pending + completed` (0이면 빈 바 표시)

바 차트:
- `idle` 세그먼트 미표시
- 3색: running(sky) / pending(amber) / completed(emerald)
- 분모를 `running + pending + completed`로 계산 (기존 `sessionStats.total` 사용 금지)
- `SESSION_UI_STATUS_META.idle`은 워크스페이스 카드 배지용으로 유지 (제거 안 함)

리스트 섹션:
- '진행 중인 워크스페이스' → **'진행 중인 채팅'**: `chatStats.runningSample` 사용, 표시: `채팅 title | 워크스페이스 이름`
- '최근 완료': `chatStats.completedSample` 사용, 동일 포맷

---

### 4. 채팅 에이전트 분포 카드

**타이틀**: `'채팅 에이전트 분포'`  
**도넛 중앙 레이블**: `'chats'`  
**도넛 중앙 수치**: `Object.values(chatStats.agentDistribution).reduce((a, b) => a + b, 0)`  
**데이터 소스**: `chatStats.agentDistribution`  
**레전드**: `AGENT_OPTIONS`(claude/codex/gemini)만 표시. `unknown`은 레전드 미표시.

---

### 5. 워크스페이스 카드 body 영역

`totalChats > 0`일 때:
```
[수평 바 차트]
[겹침 아이콘 그룹]    [상태 배지]
```

`totalChats === 0` 또는 `chatAgentCounts` 없을 때:
```
[텍스트: "채팅 없음"]  [상태 배지]
```

**수평 바 차트** (CSS 클래스 `chatAgentBar`):
- `chatAgentCounts` 중 count > 0 인 에이전트만 세그먼트 표시 (`unknown` 포함)
- 각 세그먼트 width = `count / totalChats * 100%`
- 배경색: 해당 에이전트 `accentColor` (`unknown`은 `var(--text-muted)` fallback)
- 높이: 6px

**겹침 아이콘 그룹** (CSS 클래스 `agentAvatarStack`):
- 프론트엔드의 `AgentFlavor`는 `lib/happy/types.ts`의 것을 사용 (`'claude'|'codex'|'gemini'|'unknown'`)
- `SessionDashboard.tsx` 내 지역 `AgentFlavor` 타입 재정의 제거 → `lib/happy/types.ts` import 사용
- `chatAgentCounts` 내림차순 정렬 → 1위 에이전트가 DOM상 첫 번째, z-index 가장 높음
- count === 0인 에이전트 제외
- `unknown` 에이전트 아이콘: 렌더링 안 함 (아이콘 컴포넌트 없으므로 필터링)
- 각 아이콘: 원형(24×24px), `accentBg` 배경, 2px solid white 테두리
- 겹침: 두 번째 이후 아이콘 `marginLeft: -8px`

---

## `lib/happy/utils.ts` 신규 파일

다음 함수들을 포함:
```ts
export function extractLastDirectoryName(path: string): string { ... }
export function resolveAgentFlavor(agent: unknown): AgentFlavor { ... }
```

`SessionDashboard.tsx`의 `extractLastDirectoryName` 지역 정의 제거 → import 사용.

---

## 파일별 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `lib/happy/types.ts` | `ChatSample`, `GlobalChatStats` 타입 추가; `SessionSummary`에 `chatAgentCounts?`, `totalChats?` 추가 |
| `lib/happy/utils.ts` | **신규**: `extractLastDirectoryName`, `resolveAgentFlavor` 함수 |
| `lib/happy/client.ts` | `createSession` input.agent optional 변경, `flavor ?? 'claude'` 기본값 적용 |
| `lib/happy/normalizer.ts` | `chatAgentCounts`, `totalChats` pass-through 확인 (명시적 필드 목록 방식이면 추가) |
| `app/api/runtime/sessions/route.ts` | GET: chatStats 집계 로직; POST: agent optional validation |
| `app/api/runtime/sessions/stream/route.ts` | chatStats 집계 (10초 캐싱 주기) |
| `app/SessionDashboard.tsx` | 모달 간소화; PathHistoryEntry 수정; 통계카드/분포카드/워크스페이스 카드 변경; pendingChatIds 추가; 지역 AgentFlavor 타입 제거 |
| `app/SessionDashboard.module.css` | `chatAgentBar`, `agentAvatarStack` 스타일 추가 |

---

## 비변경 범위

- happy 백엔드 API 스펙 (`flavor` 기본값 `'claude'`로 호환 유지)
- `resolveSessionUiStatus()` 및 `SESSION_UI_STATUS_META.idle` (워크스페이스 카드 배지용 유지)
- 세션 카드 나머지 메타 (시간, 이름 변경, 핀, 삭제)
- 서버 리소스 카드 (CPU/RAM/Storage)
- 권한 승인 처리 흐름 자체 (chatId 기준 카운팅만 추가)
