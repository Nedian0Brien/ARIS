# Plan: Provider Architecture Refactor

**Generated**: 2026-05-06
**Estimated Complexity**: High
**Inspired By**: [horang-labs/tessera](https://github.com/horang-labs/tessera) — `src/lib/cli/providers/` adapter pattern

## Overview

`runtime/providers/` 하위 구조가 파편화되어 있다. `claude/`와 `gemini/`는 16개 파일씩 별도 디렉터리로 정상화되어 있는 반면, **Codex는 디렉터리 자체가 존재하지 않고 5,921줄짜리 [`happyClient.ts`](../../services/aris-backend/src/runtime/happyClient.ts)에 인라인으로 박혀 있다.** 그 결과 [`providerCommandFactory.ts`](../../services/aris-backend/src/runtime/providers/providerCommandFactory.ts)는 `claude`와 `gemini`만 분기하고 codex는 누락된 상태다.

본 계획은 Tessera의 `CliProvider` adapter 패턴, managed worktree 자동화, graceful shutdown 가드 세 가지를 도입하면서, 그 과정에서 Codex를 정상 위치(`runtime/providers/codex/`)로 추출하고 `happyClient.ts`를 슬림화하는 것을 목표로 한다.

빅뱅 마이그레이션은 금지한다. **새 인터페이스로 Codex를 먼저 옮기고, 그 다음 Claude/Gemini를 점진 마이그레이션**한다.

## Guiding Invariants

- 상위 레이어는 provider raw payload key shape를 직접 알지 않는다.
- provider identity와 local correlation key는 절대로 같은 값으로 취급하지 않는다.
- `parseStdout` 류 파서는 **순수 함수**여야 하며, side effect는 descriptor로 반환한다 (caller가 실행 책임).
- ndjson 로그 포맷(`chat-{agent}-{chatId}-{threadId}-parsed.ndjson`)은 변경하지 않는다 — `deploy/ops/debug-chat-log.sh` 등 외부 도구 의존성 보존.
- `ProviderRuntime`(기존)과 `CliProvider`(신규)는 마이그레이션 기간 동안 공존을 허용하되 **최대 2주 이내에 일원화**한다.
- worktree 명명 규칙은 AGENTS.md의 표준 절차(`scripts/create_worktree_with_shared_node_modules.sh`)와 호환되어야 한다.
- PM2 cluster 환경 (aris-backend는 cluster mode)에서 worker 충돌 없이 동작해야 한다.

## Current State Snapshot

### 정상화된 영역
- `runtime/providers/claude/` — 16개 파일, 약 2,400 LOC. `claudeAdapter`/`Runtime`/`ProtocolMapper`/`SessionRegistry`/`PermissionBridge`/`MessageQueue`/`EventBridge` 등 책임별 분리 완료.
- `runtime/providers/gemini/` — 16개 파일, 약 3,300 LOC. ACP 클라이언트 포함 동일 구조.
- `runtime/contracts/providerRuntime.ts` — `ProviderRuntime` 인터페이스 (sendTurn / abortTurn / recoverSession / isRunning).
- `runtime/contracts/sessionProtocol.ts` — `SessionProtocolEnvelope` 6종(turn-start/turn-end/tool-call-start/tool-call-end/text/stop).

### 파편화된 영역
- `runtime/providers/codex/` — **존재하지 않음**.
- [`happyClient.ts`](../../services/aris-backend/src/runtime/happyClient.ts) — 5,921줄 단일 파일. codex 키워드 32회 등장. 다음 심볼이 모두 인라인:
  - 환경 상수: `CODEX_SANDBOX_MODE`, `CODEX_RUNTIME_MODE`, `CODEX_TURN_TIMEOUT_MS`, `CODEX_APP_SERVER_POST_TURN_QUIET_MS`, `CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS`
  - 타입: `CodexPermissionRequest`, `CodexAppServerFailureKind`, `CodexAppServerFailureInfo`, `CodexAppServerSocket`
  - WebSocket 라이프사이클: `connectCodexAppServerSocket` (line 1650), `terminateCodexAppServerProcess` (1797), `rejectCodexAppServerPendingRequests` (1821), `createCodexAppServerSocket`, `reserveCodexAppServerPort`, `buildCodexAppServerSpawnOptions`, `buildCodexAppServerListenUrl`, `createCodexAppServerAbortPromise`, `normalizeCodexAppServerMessageData`
  - 정책: `normalizeCodexApprovalPolicy`, `normalizeCodexApprovalDecision`, `inferCodexApprovalRisk`, `inferCodexFileWriteItem`, `isMissingCodexThreadError`, `buildCodexThreadCacheKey`
  - 인라인 분기: `flavor === 'codex'` (line 923, 5368), `channel` 선택 (line 2438), `spawn('codex', args, ...)` (line 4221)
  - `agent: 'codex'` 이벤트 로그 호출 22회 (lines 3283 ~ 4541 산재)
- [`providerCommandFactory.ts`](../../services/aris-backend/src/runtime/providers/providerCommandFactory.ts) — claude/gemini만 분기. codex 분기 누락.

### 1급 시민으로 정의된 점
- [`types.ts`](../../services/aris-backend/src/types.ts:1): `AgentFlavor = 'codex' | 'claude' | 'gemini' | 'unknown'`
- [`server.ts`](../../services/aris-backend/src/server.ts) zod schema: `z.enum(['codex', 'claude', 'gemini', 'unknown'])` × 2

즉 **타입과 입력 게이트는 codex를 알지만, 실행 어댑터 계층은 codex를 모른다.** 이 단절을 `ProviderRuntime` 인터페이스 너머에서 인라인으로 메우고 있는 곳이 `happyClient.ts`다.

## Target Architecture

```
runtime/
  contracts/
    providerRuntime.ts        # 기존 — 마이그레이션 종료 후 cliProvider로 흡수 또는 deprecated
    sessionProtocol.ts        # 기존
    cliProvider.ts            # NEW — Tessera 스타일 CliProvider 인터페이스
    parsedMessage.ts          # NEW — { envelope, sideEffect } 타입
    cliStatus.ts              # NEW — 'connected' | 'needs_login' | 'not_installed'
    providerRegistry.ts       # NEW — globalThis 싱글턴, registerIfAbsent
  providers/
    providerCommandFactory.ts # claude/gemini/codex 모두 분기
    claude/                   # 기존 16파일 + claudeAdapter (CliProvider impl) 추가
    gemini/                   # 기존 16파일 + geminiAdapter 추가
    codex/                    # NEW — 아래 구조
      codexAdapter.ts
      codexLauncher.ts
      codexProtocolMapper.ts
      codexAppServerClient.ts # connectCodexAppServerSocket 등 흡수
      codexAppServerLifecycle.ts # terminate/reject/abort
      codexThreadCache.ts
      codexSandboxPolicy.ts
      codexPermissionBridge.ts
      codexMessageQueue.ts
      codexSessionRegistry.ts
      codexProtocolFields.ts
      codexEventBridge.ts
      types.ts
  managedWorktree/            # NEW — Tessera src/lib/worktrees/ 기반
    naming.ts
    allocator.ts
    preflight.ts
    retention.ts
  happyClient/                # Phase 6 — 기존 happyClient.ts 골격 분해
    index.ts
    runtimeStore.ts
    runStaleCleanup.ts
    messagePersistence.ts
    ...
```

## Phase Plan

각 Phase는 **별도 worktree, 별도 PR**. PR 머지 사이에 dev proxy 검증 필수.

### Phase 0 — Diagnosis & Plan (현재 PR)
- 본 문서 (`provider-architecture-refactor-plan.md`)
- [`codex-backend-alignment-plan.md`](./codex-backend-alignment-plan.md) — gemini-backend-alignment-plan과 같은 깊이의 Codex 정렬 세부 계획
- 코드 변경 없음. 리뷰 후 머지.

### Phase 1 — CliProvider 인터페이스 도입 (worktree 2)
**목표**: 새 인터페이스를 도입하되 기존 `ProviderRuntime`은 손대지 않는다. 어떤 provider도 아직 새 인터페이스를 implement하지 않는 "빈 골격" 상태에서 PR.

- `runtime/contracts/cliProvider.ts` — Tessera `CliProvider` 인터페이스 그대로 차용 (`getProviderId`, `getDisplayName`, `isAvailable`, `getCliArgs`, `spawn`, `sendMessage`, `parseStdout`, `parseSessionStdout?`, `handleSessionExit?`, `generateTitle`, `updateSessionConfig?`, `sendApprovalResponse?`, `sendInterrupt?`, `createSkillSource?`, `onSessionReady?`, `checkStatus`)
- `runtime/contracts/parsedMessage.ts` — `ParsedMessage = { serverMessage, sideEffect? }` + `ParsedMessageSideEffect` discriminated union
- `runtime/contracts/cliStatus.ts` — `CliConnectionStatus` 3-state + `CliStatusResult` (version 포함)
- `runtime/contracts/providerRegistry.ts` — `CliProviderRegistry` + `cliProviderRegistry` globalThis 싱글턴 + `registerIfAbsent`
- 단위 테스트: registry register/getProvider/registerIfAbsent/listAvailable

**검증**: `tsc --noEmit` 통과, 기존 동작 무영향, 새 파일들이 어디서도 import되지 않음.

### Phase 2 — Codex Provider 정상화 ⭐ 최대 가치 (worktree 3)
[`codex-backend-alignment-plan.md`](./codex-backend-alignment-plan.md) 참조.

요지:
1. `runtime/providers/codex/` 신설.
2. `happyClient.ts`에서 codex 전용 코드(환경 상수 6개, 타입 4개, 헬퍼 15개+, 분기 2곳, 이벤트 로그 호출 22개)를 추출.
3. `codexAdapter`가 `CliProvider`를 implement.
4. `providerCommandFactory.ts`에 codex 분기 추가.
5. `cliProviderRegistry.registerIfAbsent('codex', () => codexAdapter)`.
6. `happyClient.ts`는 codex 부분만 thin caller로 축소 — 이때 **기존 ndjson 이벤트 로그 포맷은 절대 변경 금지**.
7. 회귀 검증: codex chat 시나리오 E2E + 기존 happy event logger 출력 비교 fixture.

**검증**: codex 채팅 통합 테스트 통과, ndjson 로그 diff 빈 결과, `tsc --noEmit` 통과.

### Phase 3 — Managed Worktree 자동화 (worktree 4)
- `runtime/managedWorktree/naming.ts` — Tessera `naming.ts` 그대로 차용. 한국어 IME `isComposing` 가드, slug 정규화, mmdd-xx 슬러그.
- `runtime/managedWorktree/allocator.ts` — `~/.aris/worktrees/<projectSlug>/<branchName>` 자동 할당. 충돌 시 suffix.
- `runtime/managedWorktree/preflight.ts` — git 설치 / repo 여부 체크, 명확한 에러 코드 (`GIT_NOT_INSTALLED`, `PROJECT_NOT_GIT_REPOSITORY`).
- `runtime/managedWorktree/retention.ts` — 만료된 worktree 자동 정리. **PM2 cluster guard**: `process.env.NODE_APP_INSTANCE === '0'`인 leader worker만 실행 (또는 별도 cron 컨테이너).
- 기존 [`worktreeManager.ts`](../../services/aris-backend/src/runtime/worktreeManager.ts) (2.4KB)와 [`scripts/create_worktree_with_shared_node_modules.sh`](../../scripts/create_worktree_with_shared_node_modules.sh)는 유지. allocator 내부에서 후크로 호출해 node_modules 심볼릭 링크 자동 연결까지 한 번에.

**검증**: allocator 단위 테스트, PM2 cluster 환경에서 retention 중복 실행 없음을 로그로 확인.

### Phase 4 — Claude/Gemini 마이그레이션 (worktree 5)
- 기존 디렉터리는 손대지 않고 `claudeAdapter` / `geminiAdapter` 클래스를 추가해서 `CliProvider`를 implement.
- `cliProviderRegistry.registerIfAbsent('claude', ...)` / `'gemini'` 등록.
- 기존 `ProviderRuntime`을 어댑터 안에서 위임 호출하는 형태로 시작.

**검증**: 두 provider의 채팅 회귀 테스트 통과.

### Phase 5 — Graceful Shutdown + Status Prewarm (worktree 6)
- aris-backend `server.ts` + aris-web `server.mjs`에 동일 패턴 도입:
  - 중복 시그널 가드 (`shuttingDown` flag)
  - 10초 강제 종료 타이머 (`unref` 처리)
  - `processManager.cleanup()` 동등 — provider별 spawned child 그룹 kill
- `prewarmCliStatusSnapshot('server')` — 서버 시작 시 모든 등록된 CliProvider의 `checkStatus`를 비동기로 미리 호출, 첫 페이지 진입 지연 ↓.
- 기존 PM2 graceful shutdown 설정과 호환 확인.

**검증**: `pm2 reload aris-backend` 시 진행 중 turn이 안전하게 마무리되는지, `kill -SIGTERM` 시 child process group까지 정리되는지 확인.

### Phase 6 — happyClient.ts 해체 (worktree 7)
- Phase 2 이후 codex가 빠져나가도 happyClient.ts는 약 4,500줄 남음. claude/gemini 잔여 일반 로직과 runtime store, persistence, run-key 관리, agent message sanitizer 잔여물 등이 섞여 있음.
- `happyClient/` 디렉터리로 분해. CLAUDE.md "MANY SMALL FILES > FEW LARGE FILES" (200~400 LOC) 원칙 적용.
- `happyClient.ts`는 barrel export로 축소.

**검증**: 외부 import 경로 호환성 유지, 단위 테스트 통과.

## Risks & Mitigations

### R1. happyClient.ts에 비-provider 로직이 섞여 있다
**증상**: `runStaleCleanup`, `messagePersistence`, `appendAgentMessage`, `agentMessageSanitizer` 등 provider-agnostic 로직과 codex/claude/gemini 분기가 같은 메서드에 공존.

**완화**: Phase 2에서는 **provider 종속 코드만** 추출한다. provider-agnostic 코드는 happyClient에 그대로 둔다. Phase 6에서 별도 분해.

### R2. ProviderRuntime ↔ CliProvider 중복 인터페이스
**증상**: 마이그레이션 기간 동안 두 인터페이스가 공존해 caller가 어느 것을 써야 할지 헷갈림.

**완화**: Phase 1 PR 본문에 deprecation 일정 명기. Phase 4 종료 직후 PR로 `ProviderRuntime` 사용처를 모두 `CliProvider`로 교체하고 `ProviderRuntime` 삭제 또는 thin wrapper로 축소.

### R3. PM2 cluster + retention 충돌
**증상**: 4개 worker가 동시에 retention 돌리면 worktree 삭제 race.

**완화**: `process.env.NODE_APP_INSTANCE === '0'` leader 가드 또는 PM2 ecosystem에 별도 `aris-backend-cron` 프로세스 분리. Phase 3 PR에서 둘 중 결정.

### R4. ndjson 로그 포맷 회귀
**증상**: codex 추출 과정에서 `agent: 'codex'` 이벤트 페이로드 키가 한 글자라도 바뀌면 [`debug-chat-log.sh`](../../deploy/ops/debug-chat-log.sh) / project memory 조회 / 외부 분석 파이프라인이 깨짐.

**완화**:
1. Phase 0에서 codex 채팅 1회 실행해 raw/parsed ndjson을 fixture로 저장.
2. Phase 2에서 동일 시나리오 실행 후 fixture와 byte-level diff. 차이 0 확인 후 PR 가능.

### R5. CODEX_RUNTIME_MODE 분기 (`app-server` vs `exec`)
**증상**: codex는 두 가지 채널을 가지고 있다. WebSocket app-server (default)와 exec stdin/stdout. 추출 시 두 경로 모두 보존 필요.

**완화**: `codexAdapter`는 두 채널을 strategy 패턴으로 내장. `codexAppServerClient` vs `codexExecClient` 두 모듈로 분리하고 adapter가 환경변수에 따라 선택.

### R6. happy-server JWT vs RUNTIME_API_TOKEN 혼동
**증상**: AGENTS.md 디버깅 가이드에 명시된 인증 토큰 분리. 리팩토링 중 토큰 사용처가 섞이면 production 디버깅 불가.

**완화**: 본 리팩토링은 토큰 처리 코드를 건드리지 않는다 — happy-server 클라이언트 부분은 Phase 6에서만 정리.

## Definition of Done (전체)

- `happyClient.ts`에서 `codex` 키워드 출현 0회 (또는 import문 1회 이내).
- `runtime/providers/{claude,gemini,codex}/` 세 디렉터리가 동등한 책임 분포.
- `cliProviderRegistry`에 세 provider 모두 등록.
- `providerCommandFactory.ts`가 세 provider 모두 분기.
- AgentFlavor union의 모든 1급 시민이 실행 어댑터 계층에서도 1급 시민.
- 기존 채팅 시나리오 회귀 0건. ndjson fixture diff 0건.
- happyClient.ts < 1,500 LOC (Phase 6 종료 시점).
- PM2 cluster 환경에서 graceful shutdown 시 자식 프로세스 잔존 0건.

## Phase별 PR 라벨 / 브랜치 컨벤션

- 브랜치: `refactor/provider-architecture-phaseN-<short-name>`
- PR 제목 prefix: `refactor(provider-arch): phaseN - <name>`
- 라벨: `refactor`, `provider-arch`, `phase-N`

## 참고

- Tessera 원본: <https://github.com/horang-labs/tessera>
- Tessera 핵심 파일:
  - `src/lib/cli/providers/provider-contract.ts` — CliProvider 인터페이스
  - `src/lib/cli/providers/registry.ts` — globalThis 싱글턴 패턴
  - `src/lib/cli/providers/message-types.ts` — ParsedMessage + sideEffect
  - `src/lib/worktrees/managed.ts` + `naming.ts` — managed worktree
  - `server.ts` — graceful shutdown 패턴
- 선례 문서:
  - [`gemini-backend-alignment-plan.md`](./gemini-backend-alignment-plan.md) — Phase 2의 톤/깊이 기준
  - [`claude-protocol-conformance.md`](./claude-protocol-conformance.md)
  - [`gemini-protocol-conformance.md`](./gemini-protocol-conformance.md)
