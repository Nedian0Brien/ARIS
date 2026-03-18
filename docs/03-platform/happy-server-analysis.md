# Happy-Server 의존성 분석 및 최적화 계획

> 작성일: 2026-03-18
> 현재 버전: happy-coder 0.13.0

---

## 1. 아키텍처 개요

```
[aris-web] (Docker :3301/:3302)
    │ SSE 스트림 (1,500ms 폴링 루프)
    ▼
[aris-backend] (PM2 cluster :4080)
    │ HTTP REST (HAPPY_SERVER_TOKEN)
    ▼
[happy-server] (Docker :3005)
    │ Prisma ORM
    ▼
[happy-postgres] (Docker, happy-net 내부)
    DB: handy / tables: Session, SessionMessage
```

## 2. Happy-Server의 역할

Happy-server는 **세션·메시지 영속성 레이어**만 담당한다.
실제 에이전트(Gemini/Claude/Codex) 실행은 aris-backend가 subprocess로 직접 수행한다.

### ARIS가 사용하는 API

| 엔드포인트 | 역할 |
|---|---|
| `GET /v1/sessions` | 세션 목록 전체 조회 |
| `POST /v1/sessions` | 세션 생성 (`tag`, `metadata` 저장) |
| `DELETE /v1/sessions/:id` | 세션 삭제 (kill 액션) |
| `GET /v3/sessions/:id/messages?after_seq=&limit=` | 메시지 페이지네이션 조회 |
| `POST /v3/sessions/:id/messages` | 메시지 저장 (`appendMessage`) |

### DB 스키마 (PostgreSQL)

**Session**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | text PK | CUID |
| accountId | text FK | Account 참조 |
| tag | text UNIQUE | `aris-{flavor}-{uuid}` |
| metadata | text | JSON 직렬화 (`flavor`, `path`, `approvalPolicy`, `model`, `status`) |
| agentState | text | 에이전트 내부 상태 |
| seq | integer | 버전 카운터 |
| active | boolean | 활성 여부 |
| createdAt / updatedAt | timestamp | |

**SessionMessage**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | text PK | |
| sessionId | text FK | Session 참조 |
| seq | integer | 순서 (sessionId 기준 단조 증가) |
| content | jsonb | 메시지 페이로드 전체 |
| localId | text | 클라이언트 중복 방지 키 |

---

## 3. CPU 사용량이 높은 원인

### 원인 A — tsx 런타임 컴파일 오버헤드 (주요 원인)

Happy-server 컨테이너가 TypeScript 소스를 **tsx로 JIT 컴파일**하여 실행한다.

```
docker exec happy-server top:
  PID 40: node --require tsx/preflight.cjs --import tsx/dist/loader.mjs ./sources/main.ts
           → CPU 86.7%, MEM 1.0 GiB (상시)
```

`tsx`는 Node.js의 `--import` loader hook을 통해 모든 모듈 로드 시점에 TypeScript를 변환한다.
프로덕션에서 컴파일된 JS를 실행하면 이 오버헤드가 완전히 제거된다.

### 원인 B — HTTP 폴링 기반 이벤트 스트리밍

```
aris-web 클라이언트 (탭 당 1개 SSE 연결)
  → /api/runtime/sessions/:id/events/stream (Next.js API Route)
      ↓ while(!aborted) 루프, STREAM_POLL_INTERVAL_MS = 1,500ms
      → aris-backend: getSessionRealtimeEvents() (인메모리, 경량)
      → aris-backend: streamSessionEvents()
          → happy-server: GET /v3/sessions/:id/messages?after_seq=&limit=500
              → PostgreSQL 쿼리 (seq 인덱스 사용)
```

세션 1개당 초당 ~0.67회 DB 쿼리. 여러 세션/탭이 열리면 선형으로 증가.

### 원인 C — getSession() 비효율 (보조 원인)

`getSession(sessionId)` 구현이 `listSessions()`(전체 목록)를 조회한 뒤 filter로 단일 세션을 찾는다.
세션이 많을수록 불필요한 데이터 전송이 발생한다.

```typescript
// happyClient.ts:4651
async getSession(sessionId: string): Promise<RuntimeSession | null> {
  const sessions = await this.listSessions();  // ← 전체 조회
  return sessions.find((session) => session.id === sessionId) ?? null;
}
```

`getSession`은 `listMessages`, `listRealtimeEvents`, `isSessionRunning`, `applySessionAction` 등 거의 모든 메서드에서 호출된다.

---

## 4. 최적화 계획

### 단기 (이미 적용)

| 항목 | 방법 | 효과 |
|---|---|---|
| **A. tsx → 번들 JS 실행** | esbuild로 `sources/main.ts`를 단일 CJS 번들로 컴파일, 컨테이너 재시작 시 번들 사용 | tsx JIT 오버헤드 제거, CPU ~80%↓ 예상 |
| **B. getSession() 캐싱** | `HappyRuntimeStore`에 TTL 캐시 추가, `listSessions()` 응답을 1초간 재사용 | `getSession` 호출당 happy-server 왕복 제거 |

### 중기

| 항목 | 방법 | 효과 |
|---|---|---|
| **세션/메시지 DB를 aris-backend에 직접 통합** | aris-backend에 Prisma + PostgreSQL 추가, happy-server 컨테이너 제거 | HTTP 왕복 완전 제거, 인프라 단순화 |
| **폴링 → Push 전환** | aris-backend에서 SSE/WebSocket으로 이벤트 push | 1.5초 폴링 제거 |

### 장기

- `listAllMessages`의 최대 1000 페이지 순차 요청 로직 제거 (현재 페이지네이션 없이 호출 시 실행)
- happy-server의 다른 기능(Account, 모바일 연동 등) 불필요한 경우 제거

---

## 5. 번들 빌드 방법

```bash
# 컨테이너 내부에서 실행
docker exec happy-server /bin/sh -c "
  cd /repo/packages/happy-server && \
  /repo/node_modules/.bin/esbuild ./sources/main.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile=/repo/packages/happy-server/dist/main.cjs \
    --alias:@=./sources \
    --external:@prisma/client \
    --external:prisma \
    --external:pino \
    --external:pino-pretty \
    --external:thread-stream \
    --external:privacy-kit \
    --banner:js=\"const __importMetaUrl = require('url').pathToFileURL(__filename).href;\"
"
```

재시작 스크립트: `deploy/ops/rebuild-happy-server-bundle.sh`

---

## 6. 참고 파일

| 파일 | 설명 |
|---|---|
| `services/aris-backend/src/runtime/happyClient.ts` | happy-server HTTP 클라이언트 전체 (`HappyRuntimeStore`) |
| `services/aris-backend/src/runtime/happyEventLogger.ts` | happy-server 이벤트 NDJSON 로거 |
| `services/aris-web/app/api/runtime/sessions/[sessionId]/events/stream/route.ts` | SSE 스트림 (폴링 루프) |
| `deploy/ops/rebuild-happy-server-bundle.sh` | 번들 빌드 및 컨테이너 재시작 스크립트 |
