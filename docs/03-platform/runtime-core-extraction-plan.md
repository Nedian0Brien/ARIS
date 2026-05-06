# Plan: Runtime Core Extraction & Happy-Server Removal (Phase 2.5)

**Generated**: 2026-05-06
**Estimated Complexity**: High
**Parent Plan**: [`provider-architecture-refactor-plan.md`](./provider-architecture-refactor-plan.md)
**Predecessor**: [`happy-server-internalization-plan.md`](./happy-server-internalization-plan.md) — interrupted at "운영 환경 전환 완료, 컨테이너 제거 미완"

## Overview

`happyClient.ts`(5,921 LOC, 단일 파일·단일 클래스)의 이름과 책임이 어긋나 있다. 본래 의도는 **외부 happy-server 컨테이너의 HTTP 클라이언트**였으나, 실제로는 ARIS 런타임의 코어(provider 실행 / 권한 라우팅 / 실시간 이벤트 버퍼 / 세션 상태)까지 떠안고 있다. 동시에 [`happy-server-internalization-plan.md`](./happy-server-internalization-plan.md)에 따라 prod는 이미 `RUNTIME_BACKEND=prisma`로 전환되었고 `PrismaRuntimeStore`가 모든 storage 책임을 커버한다 — 즉 happy-server는 이미 dead path지만 코드와 환경변수, deploy 스크립트에 잔존하고 있다.

본 phase는 두 가지를 동시에 처리한다:

1. **happy-server 레거시 경로 완전 제거** — store.ts의 `'happy'` backend 분기, happyClient.ts의 HTTP 메서드, deploy/ecosystem의 `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN` require, dev hot-reload의 `DEV_HAPPY_SERVER_*` fallback, `rebuild-happy-server-bundle.sh` 등.
2. **happyClient.ts 책임 분해 + 리네임** — 5개 책임 영역(provider 실행 / 권한 라우팅 / 실시간 이벤트 / active run / 세션 lifecycle)을 책임별 모듈로 추출하고, 남은 파일을 `runtimeCore.ts`로 리네임. 이름이 정직해진다.

이 두 작업은 의존 관계가 있다 — happy-server HTTP 메서드를 먼저 걷어내야 happyClient의 진짜 책임이 드러난다. 따라서 8 sub-step을 단일 phase로 묶고 단계 간 머지·검증을 강제한다.

## Guiding Invariants

- 외부 행동 변경 0건. 모든 sprint는 회귀 0을 검증한 뒤에 머지한다.
- `RUNTIME_BACKEND` env는 `prisma`만 지원하도록 좁힌다. `mock`은 테스트 전용 path로 보존, `happy`는 제거.
- `RuntimeStoreBackend` 인터페이스(현재 store.ts가 의존하는 표면)는 변경하지 않는다. 분해는 인터페이스 안쪽에서만 일어난다.
- `PrismaRuntimeStore`는 storage 책임만 가진다. provider 실행, 권한 라우팅, 실시간 이벤트 버퍼는 별도 모듈로 추출한다.
- ndjson 로그 포맷(`chat-{agent}-{chatId}-{threadId}-parsed.ndjson`)은 변경하지 않는다 — 외부 도구 호환성.
- prod 운영 환경은 단계별로 안전하게 전환한다. env 변경은 항상 코드 변경보다 먼저 검증한다.

## Current State Snapshot

### happy-server 의존성 잔존 위치

| 위치 | 형태 | 동작 여부 (prod) | 제거 단계 |
|---|---|---|---|
| `services/aris-backend/src/store.ts:19` | `type RuntimeBackend = 'mock' \| 'happy' \| 'prisma'` | `'happy'` 미사용 (prisma 전환 완료) | 2.5b |
| `services/aris-backend/src/store.ts:547-553` | `if (runtimeBackend === 'happy')` 분기 + `delegate = new HappyRuntimeStore(...)` | dead branch | 2.5b |
| `services/aris-backend/src/runtime/happyClient.ts` | `HappyRuntimeStore`의 HTTP 메서드들 (`fetchSessions`, `fetchSession`, `postMessage`, …) | dead methods (RUNTIME_BACKEND=prisma에서 호출 안 됨) | 2.5b |
| `deploy/.env` | `HAPPY_SERVER_URL`, `HAPPY_SERVER_TOKEN` 평문 | env 변수만 살아있음 | 2.5g |
| `deploy/internal/backend_zero_downtime.sh` | `require_env_keys ... HAPPY_SERVER_URL HAPPY_SERVER_TOKEN` | deploy 시 enforce | 2.5g |
| `deploy/ecosystem.config.cjs` | PM2가 `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN` 자식 프로세스에 propagate | 환경 노출 | 2.5g |
| `deploy/dev/run_web_dev_hot_reload.sh` | `DEV_HAPPY_SERVER_URL`/`DEV_HAPPY_SERVER_TOKEN` fallback | dev 진입점 | 2.5g |
| `deploy/ops/rebuild-happy-server-bundle.sh` | happy-server 컨테이너 빌드 스크립트 | 컨테이너가 외부 인프라에 있는 동안만 의미 | 2.5h |
| `deploy/ops/debug-runbook.md` | `HAPPY_SERVER_URL=http://127.0.0.1:3005` 다이어그램 | 문서 | 2.5g/h |
| `services/aris-web/lib/config.ts`, `.env`, `server.mjs` | `HAPPY_SERVER_*` 참조 | aris-web → backend 호출 시 | 2.5g |
| `services/aris-web/.env.example` | `# Optional if using happy encrypted sessions` 주석 | docs only | 2.5g |
| `docker-compose.yml` (repo 내) | happy-server 컨테이너 정의 **없음** | — | (조치 불필요) |
| **`deploy/.env`에 `HAPPY_SERVER_TOKEN` JWT 평문 존재** | git tracked 여부 확인 필요 | 보안 노출 가능성 | 2.5a (조사) |

### `HappyRuntimeStore` 클래스 책임 인벤토리

`services/aris-backend/src/runtime/happyClient.ts:1919` 에서 정의된 단일 클래스의 필드/메서드를 책임별로 분류:

| # | 책임 | 필드 / 메서드 | 추출 대상 |
|---|---|---|---|
| ① | happy-server HTTP 클라이언트 | `getSession`, `listSessions`, `listMessages`, `postMessage`, `fetchSessionMessages`, ... | **삭제** (PrismaStore가 대체 완료, dead code) |
| ② | provider 실행 엔진 | `runAgentCommand`, `runAgentCli`, `runCodexCliWithEvents`, `runCodexAppServerWithEvents`, `runCodexExecCliWithEvents`, `runGeminiAcpTurn` | **`runtime/providers/*` 어댑터** (Phase 3+에서 흡수) |
| ③ | 권한 협상 오케스트레이터 | `permissions`, `providerPermissionIndex`, `providerPermissionWaiters`, `providerPermissionDecisions` Maps + `awaitProviderPermissionDecision`, `finalizeCodexRuntimePermissions`, `decidePermission` | `runtime/orchestration/permissionRouter.ts` (新) |
| ④ | 실시간 이벤트 버스 | `sessionRealtimeEvents`, `sessionRealtimeCursor` Maps + `appendRunLifecycleEvent`, `listRealtimeEvents` | `runtime/orchestration/realtimeEventBus.ts` (新) |
| ⑤ | active run / drain lifecycle | `activeRuns` Map, `draining` flag, `appendAgentMessage`, abort orchestration | `runtime/orchestration/activeRunRegistry.ts` + `sessionOrchestrator.ts` (新) |
| ⑥ | provider별 세션 상태 위임 | `claudeSessionRegistry`, `geminiSessionRegistry`, `claudeSessionScanners`, `codexThreads`, `geminiPartialTextStates` | provider별 디렉터리로 흡수 (Phase 3+) |

이 분류 후 `happyClient.ts`에 남는 것은 ②와 ⑥의 일부뿐이다. ② 또한 Phase 3~5에서 추출되므로 최종적으로는 thin wrapper만 남거나 완전히 사라진다.

## Sub-step Plan (8 sprint)

각 sprint = 별도 worktree + 별도 PR. 머지 사이에 dev proxy 검증.

### 2.5a — Plan PR (본 문서)
**산출물**: 본 plan 문서.
**코드 변경**: 0.
**조사 항목**:
- `deploy/.env`가 `.gitignore`에 의해 추적 제외인지 확인 (PR 본문에 명기).
- happy-server 컨테이너의 외부 인프라 위치 확인 (별도 docker-compose 또는 systemd?).
- aris-web의 `HAPPY_SERVER_*` 사용처가 backend 호출용인지 web 자체 의존인지 분류.

### 2.5b — Happy-server backend 정리 (2 PR로 분할 실행)

원래 한 sprint로 묶었던 항목을 실제 작업 시 두 PR로 분할했다. **self-fetch HTTP 메서드 제거**는 단순 dead-code가 아니라 PrismaStore 직접 위임 + 8개 호출 site 변환 + `request<T>` 헬퍼 + serverUrl/token 필드 정리가 묶여 있어 sprint 1개로 안전히 다루기 어렵다 → 2.5c-e의 orchestration 추출 과정에서 자연스럽게 흡수한다 (HappyRuntimeStore 메서드가 모듈로 빠져나갈 때 self-fetch 분기도 함께 사라진다).

#### 2.5b.1 — `'happy'` backend 분기 + 종속 dead code 제거 (#288 ✅)

목표: `RuntimeBackend` union에서 `'happy'` 제거 + 그 분기에서만 도달하던 dead code 동시 제거.

변경 (실측):
- `config.ts`: enum `'mock'|'happy'|'prisma'` → `'mock'|'prisma'`. `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN`/`HAPPY_ACCOUNT_SECRET` 환경변수 스키마에서 제거.
- `store.ts`: `RuntimeBackend` union narrowing. constructor `happyServerUrl?`/`happyServerToken?` 파라미터 제거. `if (runtimeBackend === 'happy')` 13줄 블록 삭제.
- `server.ts`: `ServerConfig` 타입 narrowing. `new RuntimeStore()` 호출 인자 정리. happy-bridge self-reference 가드 9줄 + kill action happy fallback 23줄 + `HAPPY_BRIDGE_HEADER`/`HAPPY_SELF_REFERENCE_ERROR` 상수 제거.
- `tests/server.test.ts`: `RUNTIME_BACKEND='happy'` 의존 테스트 2개 삭제.

검증: `tsc --noEmit` clean, `vitest run --exclude e2e` 261/261 PASS, 4 files +14 -107.

#### 2.5b.2 — Backend-side `HAPPY_SERVER_*` env 정리 (이번 PR)

목표: backend가 더 이상 읽지 않는 `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN`/`HAPPY_ACCOUNT_SECRET` env 변수를 deploy/PM2/예제 파일에서 제거. **aris-web은 손대지 않음** (별도 sprint 2.5g).

변경 대상:
- `services/aris-backend/.env.example` — `HAPPY_SERVER_*` 3줄 제거.
- `deploy/internal/backend_zero_downtime.sh` — `if [[ "$runtime_backend" == "happy" ]]` 블록 제거 (이미 `'happy'` backend가 사라졌으므로 dead).
- `deploy/ecosystem.config.cjs` — PM2 env에서 `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN`/`HAPPY_ACCOUNT_SECRET` propagation 3줄 제거.

남는 위치 (2.5g에서 처리):
- `deploy/.env` — `HAPPY_SERVER_*` 라인. 운영 단계에서 사용자 확인 후 제거.
- `deploy/dev/run_web_dev_hot_reload.sh` — `DEV_HAPPY_SERVER_*` fallback. dev 편의용이라 web 정리와 함께 제거.
- `services/aris-web/lib/config.ts`, `server.mjs`, `.env.example` — `RUNTIME_API_URL || HAPPY_SERVER_URL` legacy fallback. **prod env에 `RUNTIME_API_URL`이 명시되지 않은 상태**라 fallback 의존 가능. web 측 RUNTIME_API_URL 명시 + fallback 제거를 함께 처리.

회귀 가드:
- prod env에서 `HAPPY_SERVER_URL`이 남아 있어도 backend는 더 이상 읽지 않으므로 무영향 (config.ts에서 제거된 후 zod가 unknown key를 strip).
- `backend_zero_downtime.sh`가 새 env로 정상 동작 (require 줄어든 것뿐).

### 2.5c — `permissionRouter.ts` 추출
**목표**: 권한 협상 로직(③)을 `runtime/orchestration/permissionRouter.ts`로 분리. 외부 인터페이스는 PrismaStore의 `decidePermission` / `getPermissionById`만 통과.

변경 대상:
- `services/aris-backend/src/runtime/orchestration/permissionRouter.ts` (新) — `providerPermissionIndex`, waiters, decisions Map. `awaitProviderPermissionDecision`, `finalizeCodexRuntimePermissions`.
- `services/aris-backend/src/runtime/happyClient.ts` — 해당 메서드 삭제, router 호출로 위임.

회귀 가드:
- 권한 결정 단위 테스트(claudePermissionBridge.test, geminiPermissionBridge.test) 통과.
- "prisma backend여도 권한이 happyClient를 거친다"(memory ID 2475) 이슈가 router 추출 후 해소되는지 확인.

### 2.5d — `realtimeEventBus.ts` 추출
**목표**: 실시간 이벤트 버퍼(④)를 `runtime/orchestration/realtimeEventBus.ts`로 분리. SSE 폴링 루프가 직접 호출하는 surface 보존.

변경 대상:
- `services/aris-backend/src/runtime/orchestration/realtimeEventBus.ts` (新)
- `services/aris-backend/src/runtime/happyClient.ts` — 위임

회귀 가드:
- SSE 스트림 단위 테스트.
- 이벤트 cursor 단조 증가 검증.

### 2.5e — `activeRunRegistry.ts` + `sessionOrchestrator.ts` 추출
**목표**: ⑤를 두 모듈로 분리. activeRunRegistry는 Map과 lifecycle 이벤트, sessionOrchestrator는 drain/abort/lifecycle 메시지.

변경 대상:
- `services/aris-backend/src/runtime/orchestration/activeRunRegistry.ts` (新)
- `services/aris-backend/src/runtime/orchestration/sessionOrchestrator.ts` (新)

회귀 가드:
- abort 시나리오 단위 테스트(memory ID 7121 참고).
- drain 동작 회귀 테스트.

### 2.5f — `happyClient.ts` → `runtimeCore.ts` 리네임
**목표**: 이름과 책임 일치. 외부 import 표면(store.ts 한 곳)만 갱신.

변경 대상:
- 파일 이동: `happyClient.ts` → `runtimeCore.ts`
- 클래스 이동: `HappyRuntimeStore` → `RuntimeCore`
- `services/aris-backend/src/store.ts` — import 경로 + 클래스명 갱신
- `services/aris-backend/src/runtime/happyEventLogger.ts` 등 잔존 happy* 명칭은 단계별로 정리 (별도 sprint 또는 본 sprint에 포함)

회귀 가드:
- `tsc --noEmit`, vitest 전체 통과.
- import 경로 외 동작 변경 0.

### 2.5g — Deploy / env 정리
**목표**: `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN` env 변수와 require 가드 제거. dev hot-reload의 fallback 정리. 평문 JWT 회수.

변경 대상:
- `deploy/.env` — `HAPPY_SERVER_*` 라인 제거. **JWT는 회수(rotation)가 필요할 수 있음 — 사용자 확인 필요**.
- `deploy/internal/backend_zero_downtime.sh` — `require_env_keys`에서 `HAPPY_SERVER_*` 제거.
- `deploy/ecosystem.config.cjs` — `HAPPY_SERVER_*` propagation 제거.
- `deploy/dev/run_web_dev_hot_reload.sh` — `DEV_HAPPY_SERVER_*` fallback 제거.
- `deploy/README.md`, `deploy/ops/debug-runbook.md` — happy-server 다이어그램 갱신.
- `services/aris-backend/.env.example`, `services/aris-web/.env.example` — happy 라인 제거.
- `services/aris-web/lib/config.ts`, `.env`, `server.mjs`, 테스트 — happy-server 참조 정리.

회귀 가드:
- 운영 환경에서 backend 재시작 후 정상 부팅 (dev proxy로 사전 검증).
- backend_zero_downtime.sh가 새 env로 정상 동작.

### 2.5h — happy-server 컨테이너 연결 제거 + 운영 cleanup
**목표**: ARIS가 happy-server 컨테이너에 어떤 의미로든 의존하지 않도록 마무리.

변경 대상:
- `deploy/ops/rebuild-happy-server-bundle.sh` — **삭제** (또는 `legacy/`로 이동).
- `deploy/README.md`의 happy-server 섹션 제거.
- 외부 happy-server 컨테이너 stop/disable (인프라 단계 — 사용자 검증 필수).

회귀 가드:
- happy-server 프로세스가 정지된 상태에서 ARIS 정상 동작.
- 운영 모니터링에서 happy-server 메트릭이 사라졌는지 확인.

## Open Questions — 2.5a 조사 결과

본 plan PR 작성 시점에 일부 답을 확보했다.

| # | 질문 | 답 | 후속 |
|---|---|---|---|
| 1 | `deploy/.env`가 git tracked인가? | **No.** `git check-ignore deploy/.env` → ignored 확인. `git log -- deploy/.env` 빈 결과. JWT는 git history에 없음. | 보안 PR 별도 불필요. 2.5g에서 평문 라인만 제거. |
| 2 | happy-server 컨테이너의 정확한 위치 | `deploy/.env`의 `HAPPY_SERVER_URL=http://127.0.0.1:3005`로 보아 호스트 로컬. ARIS repo 내 `docker-compose.yml`에는 정의 없음 → **외부 인프라**(별도 docker compose 또는 systemd). | 사용자 확인 필요. 2.5h 마무리 시 정확한 stop 절차 결정. |
| 3 | HAPPY_SERVER_TOKEN rotation 필요 여부 | git에 노출 안 되었으므로 **rotation 불요**. 단 deploy/.env 자체 접근통제는 별도 점검 권장. | 2.5g에서 라인 제거만. |
| 4 | aris-web의 `HAPPY_SERVER_*` 사용처 | **Legacy fallback**. `services/aris-web/lib/config.ts:35`와 `server.mjs:35`가 `RUNTIME_API_URL \|\| HAPPY_SERVER_URL` 패턴. canonical은 `RUNTIME_API_URL/TOKEN`이고 `HAPPY_SERVER_*`는 이전 명칭 fallback일 뿐. | **제거 안전**. 단 `RUNTIME_API_URL`/`RUNTIME_API_TOKEN`이 prod env에 설정돼 있는지 사전 확인 (이미 `prod.env`에서 확인됨). |
| 5 | `happyAlignment.e2e.test.ts`가 happy-server를 실제로 띄우는지 | **No.** 파일 내 `HAPPY_SERVER` 매치 0건. 이름만 happy 시절의 잔재이고 실제로는 prisma store 기반. | 2.5b에서 그대로 통과. (선택적으로 2.5f에서 파일명 리네임 — `runtimeAlignment.e2e.test.ts`) |
| 6 | `happyEventLogger.ts` 명칭 | ndjson 파일명은 logger 클래스 이름과 독립이며 stage/turnStatus payload만 사용. **리네임 가능**. | 2.5f에서 `runtimeEventLogger.ts`로 함께 리네임. |

## Definition of Done (Phase 2.5 전체)

- `RuntimeBackend` union에 `'happy'` 없음.
- `happyClient.ts` 파일 사라짐. `runtimeCore.ts`로 리네임 + 책임 분해 완료.
- `HappyRuntimeStore` 클래스명 사라짐. `RuntimeCore`로 리네임.
- `runtime/orchestration/` 디렉터리 신설, 4개 모듈 (`permissionRouter`, `realtimeEventBus`, `activeRunRegistry`, `sessionOrchestrator`).
- prod env에서 `HAPPY_SERVER_URL`/`HAPPY_SERVER_TOKEN` 사라짐.
- deploy 스크립트가 `HAPPY_SERVER_*`를 require하지 않음.
- `rebuild-happy-server-bundle.sh` 삭제 또는 legacy로 이동.
- happy-server 컨테이너 ARIS 의존성 0.
- 263+ 단위 테스트 PASS, e2e 시나리오 회귀 0.
- happy-server-internalization-plan.md의 미완료 체크박스 모두 처리.

## Phase별 PR / 브랜치 컨벤션

- 브랜치: `refactor/runtime-core-2.5<letter>-<short-name>`
- PR 제목 prefix: `refactor(runtime-core): 2.5<letter> - <name>`
- 라벨: `refactor`, `runtime-core`, `phase-2.5`

## 마스터 플랜 갱신

본 phase 도입에 따라 [`provider-architecture-refactor-plan.md`](./provider-architecture-refactor-plan.md)의 phase 순서가 다음과 같이 정렬된다:

| Phase | 상태 | 설명 |
|---|---|---|
| 0 | ✅ | 진단 + 마스터 플랜 |
| 1 | ✅ | CliProvider 인터페이스 도입 |
| 2 | ✅ (Sprint 1+2) | Codex 골격 |
| **2.5** | ⏳ **본 plan** | runtime core 추출 + happy-server 청소 (8 sprint) |
| 3 | ⏳ | Codex Sprint 3~6 (mapper / lifecycle / permission / runtime 추출) |
| 4 | ⏳ | Managed Worktree 자동화 |
| 5 | ⏳ | Claude/Gemini 신 인터페이스 마이그레이션 |
| 6 | ⏳ | Graceful Shutdown + Status Prewarm |
| 7 | ⏳ | runtimeCore 최종 정리 (남는 게 있으면 분해, 없으면 삭제) |

## 참고

- [`happy-server-analysis.md`](./happy-server-analysis.md) — 2026-03-18 happy-server CPU 사용률 분석.
- [`happy-server-internalization-plan.md`](./happy-server-internalization-plan.md) — 본 phase의 직접적 전신. 미완료 체크박스를 본 phase가 흡수.
- [`provider-architecture-refactor-plan.md`](./provider-architecture-refactor-plan.md) — 마스터 plan.
- [`codex-backend-alignment-plan.md`](./codex-backend-alignment-plan.md) — Codex Phase 2 plan. 본 phase 종료 후 Sprint 3 재개.
