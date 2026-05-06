# Plan: Codex Backend Alignment

**Generated**: 2026-05-06
**Estimated Complexity**: High
**Parent Plan**: [`provider-architecture-refactor-plan.md`](./provider-architecture-refactor-plan.md)
**Precedent**: [`gemini-backend-alignment-plan.md`](./gemini-backend-alignment-plan.md)

## Overview

Claude/Gemini alignment를 통해 정착한 `runtime/providers/<flavor>/` subtree 구조에 맞춰 Codex 런타임을 정렬한다. 현재 Codex 경로는 어댑터 디렉터리 자체가 없고, [`happyClient.ts`](../../services/aris-backend/src/runtime/happyClient.ts) (5,921 LOC) 본문 안에 환경 상수, 타입, 라이프사이클, 정책, 이벤트 로그 호출이 인라인으로 박혀 있다. 동시에 [`providerCommandFactory.ts`](../../services/aris-backend/src/runtime/providers/providerCommandFactory.ts)는 claude/gemini만 분기하며 codex는 누락 상태다. 본 계획은 Codex를 Claude·Gemini와 동일한 구조로 끌어올리되, 새 `CliProvider` 인터페이스(Phase 1에서 도입)를 implement하는 첫 provider로 활용한다.

## Guiding Invariants

- 상위 레이어는 Codex `app-server` JSON-RPC 또는 `exec --json` raw payload key shape를 직접 알지 않는다.
- provider identity와 local correlation key (threadId, callId, runKey)는 절대로 같은 값으로 취급하지 않는다.
- `parseStdout` 류 파서는 순수 함수이며 side effect는 `ParsedMessageSideEffect` descriptor로 반환한다.
- `CODEX_RUNTIME_MODE`(`app-server` 기본 / `exec` 대체) 두 채널은 동등하게 지원한다.
- ndjson 로그 포맷(`chat-codex-{chatId}-{threadId}-{parsed,raw}.ndjson`)과 stage/turnStatus 키 이름은 변경하지 않는다.
- WebSocket app-server 라이프사이클(reserve port → spawn → connect → drain → terminate)은 변경하지 않는다 — race condition 검증된 형태 그대로 옮긴다.

## Current State Snapshot

### 구조적 누락
- `runtime/providers/codex/` 디렉터리 부재.
- `providerCommandFactory.ts`에 codex 분기 부재. 결과적으로 codex turn은 factory 경로를 우회해 `happyClient.ts`의 인라인 분기로 들어간다.

### `happyClient.ts` 인라인 인벤토리
| 카테고리 | 심볼 | 위치(라인) |
|---|---|---|
| 환경 상수 | `CODEX_SANDBOX_MODE` | 80 |
| 환경 상수 | `CODEX_RUNTIME_MODE` | 81 |
| 환경 상수 | `CODEX_TURN_TIMEOUT_MS` | 102 |
| 환경 상수 | `CODEX_APP_SERVER_POST_TURN_QUIET_MS` | 109 |
| 환경 상수 | `CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS` | 116 |
| 타입 | `CodexPermissionRequest` | 149 |
| 타입 | `CodexAppServerFailureKind` / `CodexAppServerFailureInfo` | 1148 / 1158 |
| 타입 | `CodexAppServerSocket` | 1628 |
| 정책 헬퍼 | `normalizeCodexApprovalPolicy` | ~378 |
| 정책 헬퍼 | `normalizeCodexApprovalDecision` | ~1280 |
| 정책 헬퍼 | `inferCodexApprovalRisk` | ~1289 |
| 정책 헬퍼 | `inferCodexFileWriteItem` | ~3731 |
| 정책 헬퍼 | `isMissingCodexThreadError` | ~1133 |
| 정책 헬퍼 | `buildCodexThreadCacheKey` | ~1357 |
| 정책 헬퍼 | `categorizeCodexAppServerFailure` | ~1166 |
| WebSocket 라이프사이클 | `buildCodexAppServerSpawnOptions` | ~1586 |
| WebSocket 라이프사이클 | `buildCodexAppServerListenUrl` | 1600 |
| WebSocket 라이프사이클 | `reserveCodexAppServerPort` | ~1604 |
| WebSocket 라이프사이클 | `createCodexAppServerSocket` | 1642 |
| WebSocket 라이프사이클 | `connectCodexAppServerSocket` | 1650 |
| WebSocket 라이프사이클 | `terminateCodexAppServerProcess` | 1797 |
| WebSocket 라이프사이클 | `rejectCodexAppServerPendingRequests` | 1821 |
| WebSocket 라이프사이클 | `createCodexAppServerAbortPromise` | ~1834 |
| WebSocket 라이프사이클 | `normalizeCodexAppServerMessageData` | ~3944 (호출 위치) |
| 인라인 분기 | `if (input.flavor === 'codex')` | 923 |
| 인라인 분기 | `channel = input.agent === 'codex' && CODEX_RUNTIME_MODE !== 'exec' ? 'app_server' : 'exec_cli'` | 2438 |
| 인라인 분기 | `if (flavor === 'codex' && isMissingCodexThreadError(error))` | 5368 |
| 인라인 분기 | `spawn('codex', args, ...)` | 4221 |
| 이벤트 로그 spawn | `agent: 'codex'` | 3283, 3301, 3334, 3358, 3435, 3851, 3874, 3884, 3895, 4060, 4148, 4169, 4202, 4229, 4260, 4302, 4323, 4333, 4344, 4501, 4524, 4541 (총 22회) |

총 32회의 codex 키워드, 약 700~900 LOC의 codex 종속 코드가 happyClient.ts 본문에 흩어져 있는 것으로 추정.

### 1급 시민 정의는 멀쩡함
- [`types.ts`](../../services/aris-backend/src/types.ts:1): `AgentFlavor = 'codex' | 'claude' | 'gemini' | 'unknown'`
- [`server.ts`](../../services/aris-backend/src/server.ts): zod schema 두 곳에서 codex enum 입력 받음.
- 즉 입력은 codex를 알지만, 실행은 codex를 모르는 상태가 어댑터 추출의 직접적 동기.

## Status Snapshot

- 완료: 없음 (Phase 0 진단 단계).
- 다음 우선순위:
  1. Phase 1 PR(`CliProvider` 인터페이스 + registry) 머지.
  2. 본 계획의 Sprint 1 시작.

## Sprint Plan

### Sprint 1 — Identity & Resume Boundary 문서화
**목표**: Codex의 thread/session identity 처리 규칙을 명시화. 추출 전에 invariant을 글로 굳힌다.

산출물:
- `docs/03-platform/codex-session-identity-boundary.md` — Claude/Gemini 선례 양식 따름.
- `docs/03-platform/codex-protocol-conformance.md` — `app-server` JSON-RPC와 `exec --json` 두 채널의 envelope 매핑.
- 단위 테스트: `buildCodexThreadCacheKey` 입출력 고정.

### Sprint 2 — Provider Subtree Skeleton
**목표**: `runtime/providers/codex/` 신설. 빈 클래스/모듈만 만들고 실제 동작은 happyClient.ts에 그대로 위임.

생성 파일 (모두 50~150 LOC 이내 예상):
```
runtime/providers/codex/
  codexAdapter.ts             # CliProvider 빈 implementation
  codexLauncher.ts             # buildCodexCommand (현재 buildAgentCommand의 codex 부분)
  codexSessionRegistry.ts
  codexSessionSource.ts
  codexProtocolFields.ts
  types.ts
```

이 단계에서:
- `providerCommandFactory.ts`의 `if (input.agent === 'codex')` 분기 추가.
- `cliProviderRegistry.registerIfAbsent('codex', () => codexAdapter)` 추가.
- `codexAdapter.spawn` / `sendMessage` / `parseStdout`은 happyClient.ts의 기존 함수에 위임 (지금은 export만 하면 됨).

검증: `tsc --noEmit` 통과, codex 채팅 회귀 0건.

### Sprint 3 — Protocol Mapper & Conformance Fixture
**목표**: `parseStdout`을 순수 함수화. happyClient.ts의 `parseAgentStreamLine` codex 분기를 추출.

산출물:
- `codexProtocolMapper.ts` — `app-server` JSON-RPC envelope과 `exec --json` 라인을 `SessionProtocolEnvelope`로 매핑.
- `codexProtocolFields.ts` — payload key extractors (현재 `extractFirstStringByKeys` 등 generic helper의 codex 부분).
- 테스트 fixture: 실제 codex 세션에서 캡처한 raw ndjson 5개 시나리오.
  - thread/start 응답
  - assistant text streaming
  - tool call (file_write)
  - permission request
  - turn-end with error / missing thread
- conformance 테스트: fixture → mapper → 기대 envelope 비교.

검증: fixture diff 0, codex 채팅 회귀 0건.

### Sprint 4 — App-Server Lifecycle Extraction
**목표**: WebSocket app-server 라이프사이클 9개 함수를 `codexAppServerClient.ts`/`codexAppServerLifecycle.ts`로 추출. 본 sprint가 가장 위험하다 — race condition 영역.

추출 대상 (happyClient.ts → codex/):
- `buildCodexAppServerSpawnOptions`, `buildCodexAppServerListenUrl`, `reserveCodexAppServerPort`
- `createCodexAppServerSocket`, `connectCodexAppServerSocket`
- `terminateCodexAppServerProcess`, `rejectCodexAppServerPendingRequests`
- `createCodexAppServerAbortPromise`, `normalizeCodexAppServerMessageData`
- 타입 `CodexAppServerSocket`, `CodexAppServerFailureKind`, `CodexAppServerFailureInfo`

검증:
- 기존 connection / drain / abort 시나리오 단위 테스트 그대로 통과.
- `CODEX_RUNTIME_MODE=exec`로 강제하고 회귀 한 번, default(`app-server`)로 회귀 한 번 — 양쪽 채널 모두 정상 동작.

### Sprint 5 — Permission Bridge & Policy Helpers
**목표**: 정책/권한 헬퍼를 `codexPermissionBridge.ts` / `codexSandboxPolicy.ts`로 추출.

추출 대상:
- `normalizeCodexApprovalPolicy`, `normalizeCodexApprovalDecision`
- `inferCodexApprovalRisk`, `inferCodexFileWriteItem`
- `CodexPermissionRequest` 타입과 그 builder

이 sprint에서 `claudePermissionBridge.ts` 인터페이스와 동일한 surface로 맞춘다 (sendApproval, mapDecision 등).

검증: 기존 permission 결정 회귀 fixture 통과.

### Sprint 6 — Codex Runtime Extraction
**목표**: codex turn 본체(`spawn('codex', args, ...)` ~ stdin write ~ stdout drain ~ turn-end persistence)를 `codexRuntime.ts`로 추출. happyClient.ts의 codex 분기는 thin caller로 축소.

이 시점에서 happyClient.ts의 codex 키워드 등장이 0회(또는 import 1회 이내)가 되어야 한다.

검증:
- ndjson byte-level diff: Phase 0에서 캡처한 raw/parsed fixture와 비교, 차이 0.
- 운영 시나리오 E2E:
  - new turn (thread 없음) → threadId 발급 → assistant text → turn-end
  - resume turn (thread 있음)
  - missing thread error → 자동 재시도 (line 5368 분기)
  - permission request → approve/decline → tool 실행
  - abort 중간 (signal) → app-server graceful drain → SIGTERM/SIGKILL 단계
  - timeout (`CODEX_TURN_TIMEOUT_MS` 초과)

### Sprint 7 — E2E & 운영 검증 매트릭스
**목표**: gemini-happy-alignment-e2e-matrix와 동일한 형식의 codex 매트릭스 작성 후 PR.

산출물:
- `docs/03-platform/codex-happy-alignment-e2e-matrix.md`
- production-like 환경 (dev proxy)에서 매트릭스 모든 항목 통과 확인 후 사용자 검증.

### Sprint 8 — Trace 기반 fixture 보강 (선택)
실제 codex 세션 trace 추가 수집해 mapper fixture 확장. gemini sprint 8과 동일 패턴.

## Validation Gates

- 각 Sprint PR 머지 직전:
  - `tsc --noEmit` (aris-backend, aris-web 양쪽)
  - 단위 테스트: `vitest run` (관련 영역만 targeted)
  - codex 채팅 1회 회귀 (dev proxy)
  - ndjson fixture diff 0
- Phase 2 전체 머지 직전:
  - 전체 운영 매트릭스 (Sprint 7 산출물) 모든 항목 ✅
  - `pm2 reload aris-backend` 후 진행 중 codex turn이 안전 종료
  - app-server 모드와 exec 모드 양쪽 정상

## Out of Scope (이번 alignment에서 제외)

- happy-server 클라이언트 코드 정리 (Phase 6에서 처리)
- happyClient.ts의 비-provider 영역(`runStaleCleanup`, `appendAgentMessage`, `messagePersistence`) 분해 (Phase 6)
- aris-web 측 ChatComposer / ChatInterface의 codex UX 개선 (별도 트랙)

## Definition of Done

- `runtime/providers/codex/` 디렉터리에 13~16개 파일, 각 50~400 LOC.
- `happyClient.ts`에서 `codex` 또는 `Codex` 키워드 등장 0회 (import 1회 이내 허용).
- `providerCommandFactory.ts`가 codex 분기 보유.
- `cliProviderRegistry.getProvider('codex')` 반환 가능.
- ndjson 로그 포맷·키 변동 0건.
- app-server 모드와 exec 모드 양쪽 회귀 0건.
- 운영 매트릭스 [`codex-happy-alignment-e2e-matrix.md`](./codex-happy-alignment-e2e-matrix.md) 모든 항목 ✅.
