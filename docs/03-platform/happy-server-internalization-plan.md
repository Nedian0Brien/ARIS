# happy-server 내재화 계획

## 배경

ARIS는 세션·메시지·권한 데이터를 외부 `happy-server` 컨테이너(Fastify + PostgreSQL)에 위임해 왔다.
이 의존은 다음 문제를 일으켰다:

- happy-server가 `tsx`로 TS를 JIT 컴파일하여 **CPU 86 %** 상시 점유 (2026-03-18 측정)
- 배포 복잡도: ARIS 스택과 별개의 컨테이너·DB·인증 체계 관리
- 폴링 트래픽: 분당 575 req (~9.6 req/s) 발생 (측정값 기준)

## 범위 결정

happy-server 기능 중 **ARIS에 실제로 필요한 것만** 흡수한다.

| 기능 | 결정 | 이유 |
|---|---|---|
| Sessions | ✅ 흡수 | 핵심 데이터 |
| Messages | ✅ 흡수 | 핵심 데이터 |
| Permissions | ✅ 흡수 | 핵심 데이터 |
| 인증 (auth) | ❌ 제외 | aris-web이 자체 JWT 관리 |
| 소셜 / 피드 | ❌ 제외 | ARIS에서 미사용 |
| KV Store | ❌ 제외 | ARIS에서 미사용 |
| 머신 (machines) | ❌ 제외 | ARIS에서 미사용 |
| 아티팩트 | ❌ 제외 | ARIS에서 미사용 |

## 완료된 사전 작업 (2026-03-18)

- happy-server 컨테이너를 `tsx` JIT → `esbuild` 번들 + `node` 실행으로 전환
  → CPU 86 % → 0.16 %, 메모리 1.0 GiB → 491 MiB
- aris-backend `getSession()` 1초 TTL 캐싱 도입

## 내재화 구현 (2026-03-19)

### 아키텍처

```
RUNTIME_BACKEND=prisma 설정 시:

aris-web → aris-backend (PrismaRuntimeStore) → ARIS PostgreSQL
```

기존 `mock` / `happy` 백엔드와 동일한 `RuntimeStoreBackend` 인터페이스를 구현한다.
환경변수 하나만 바꾸면 전환 가능하며, 롤백도 즉시 가능하다.

### 변경 파일

| 파일 | 내용 |
|---|---|
| `prisma/schema.prisma` | Session, SessionMessage, Permission 모델 정의 |
| `prisma/migrations/0001_init/migration.sql` | DDL (ARIS PostgreSQL에 적용) |
| `prisma.config.ts` | Prisma v7 adapter 설정 (pg Pool) |
| `src/runtime/prismaStore.ts` | `PrismaRuntimeStore` — `RuntimeStoreBackend` 완전 구현 |
| `src/config.ts` | `RUNTIME_BACKEND` enum에 `'prisma'` 추가, `DATABASE_URL` 추가 |
| `src/store.ts` | `RUNTIME_BACKEND=prisma` 분기 추가 |
| `src/server.ts` | `ServerConfig`에 `DATABASE_URL` 추가 |

### DB 스키마 (ARIS PostgreSQL 내)

```sql
Session        -- 세션 (flavor, path, status, approvalPolicy, model, riskScore)
SessionMessage -- 메시지 (seq 기반 정렬, sessionId CASCADE)
Permission     -- 권한 요청/결정 (state: pending → approved/denied)
```

## 전환 방법 (운영)

1. ARIS PostgreSQL에 migration 적용:
   ```bash
   DATABASE_URL=postgresql://... npx prisma migrate deploy
   ```
2. aris-backend 환경변수 변경:
   ```env
   RUNTIME_BACKEND=prisma
   DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/aris
   ```
3. aris-backend 재시작

happy-server 컨테이너는 그대로 유지하면서 트래픽만 끊을 수 있다.
문제 발생 시 `RUNTIME_BACKEND=happy`로 즉시 롤백.

## 다음 단계

- [ ] 운영 환경에서 migration 적용 후 `RUNTIME_BACKEND=prisma`로 전환
- [ ] happy-server 컨테이너 의존 제거 (docker-compose에서 삭제)
- [ ] 폴링 → WebSocket 전환 검토 (현재 9.6 req/s)
