# Codex Happy Alignment E2E Matrix

**Generated**: 2026-05-08
**Phase**: 2 / Sprint 7
**Predecessors**: [`codex-protocol-conformance.md`](./codex-protocol-conformance.md), [`codex-session-identity-boundary.md`](./codex-session-identity-boundary.md), [`codex-backend-alignment-plan.md`](./codex-backend-alignment-plan.md)

## 목적

Phase 2 (Sprint 1~6)에서 codex turn 본체가 `runtimeCore.ts` → `runtime/providers/codex/` 서브트리로 완전 추출된 뒤, 실제 운영 흐름에서 회귀가 없는지 검증하기 위한 E2E 기준선을 고정한다. Claude / Gemini 매트릭스의 후속이며 codex의 두 실행 채널(`app-server`, `exec`) 모두를 다룬다.

## 적용 대상 모듈

| 모듈 | 책임 |
|---|---|
| `providers/codex/codexProtocolMapper.ts` | 두 채널 raw payload → `SessionProtocolEnvelope` + `ParsedMessageSideEffect` 매핑 (Sprint 3) |
| `providers/codex/codexAppServerClient.ts` | WebSocket 소켓 생성·연결·메시지 정규화 (Sprint 4) |
| `providers/codex/codexAppServerLifecycle.ts` | app-server 자식 프로세스 launch/terminate, abort promise (Sprint 4) |
| `providers/codex/codexPermissionBridge.ts` | 4개 승인 JSON-RPC 메서드 추출 + 채널별 decision token 매핑 (Sprint 5) |
| `providers/codex/codexRuntime.ts` | `runCodexCli` / `runCodexAppServer` / `runCodexExecCli` / `resolveCodexThreadId` (Sprint 6) |

`runtimeCore.ts`에 남은 codex 키워드는 모두 위 모듈에서 import한 함수의 call site이며, 구현 코드는 0줄.

## 자동 검증 범위

| Case | 경로 | 기대 결과 | 자동화 상태 |
|---|---|---|---|
| 정책 normalize | `codexPermissionBridge.normalizeCodexApprovalPolicy` | `yolo` → `on-request` fallback, 다른 값은 그대로 통과 | `tests/codexPermissionBridge.test.ts` |
| 4개 승인 메서드 추출 | `extractCodexAppServerApproval` | modern command/patch + legacy exec/patch 모두 `permissionKey/command/reason/risk/mapDecision` 반환 | 동일 |
| modern 채널 decision 토큰 | `mapCodexDecisionForCommandApproval` / `Patch` | `allow→accept`, `allow_session→acceptForSession`, `deny→decline` | 동일 |
| legacy 채널 decision 토큰 | `mapCodexDecisionForLegacyReview` | `approved` / `approved_for_session` / `denied` | 동일 |
| network 신호 risk 격상 | extract approval (network context, grant_root) | `risk='high'`로 격상 | 동일 |
| `bash -lc` unwrap | extract approval (modern command) | wrapper 제거된 plain command 노출 | 동일 |
| failure 분류 | `classifyCodexAppServerFailure` | aborted / missing_thread / context_window / timeout / websocket_connect / websocket_closed / turn_failed / other 8개 분기 | `tests/codexProtocolMapper.test.ts` |
| missing-thread 오류 인식 | `isMissingCodexThreadError` | "thread not found" 패턴 true, 무관한 오류 false | 동일 |
| 5개 시나리오 매핑 | `mapCodexExecPayload` / `mapCodexAppServerNotification` | thread.started / agent_message / file_change / exec_approval / turn/completed | 동일 |
| permission key 형식 | `buildCodexPermissionKey` | `{sessionId}:{approvalId|callId}` | 동일 |
| thread cache key 형식 | `buildCodexThreadCacheKey` | `{sessionId}` 또는 `{sessionId}:{chatId}` | 동일 |
| 회귀 (전체 backend) | `vitest run --exclude e2e` | 315/315 PASS | CI |

## 수동 검증 범위 (운영 dev proxy)

| Case | 절차 | 기대 결과 | 직전 검증 |
|---|---|---|---|
| 신규 turn (fresh thread) | codex 세션 생성 후 첫 prompt 전송 | `thread.started` → `agent_message` → `turn/completed`. SessionChatEvent에 user prompt → run_started → Text Reply → completed 4건 persist | Sprint 4 검증 ("Hi") |
| resume turn | 같은 chat에서 두 번째 prompt 전송 | thread cache hit → resume 경로, 이전 thread id 재사용 | Sprint 5 검증 ("OK") |
| tool action (file read) | codex가 자체 컨텍스트 파일을 sed로 읽는 turn | `command_execution` payload → `File Read` action persist (`actionType=file_read`) | Sprint 5 검증 |
| missing-thread retry | 잘못된 thread id로 강제 시작 → fallback 검증 | `isMissingCodexThreadError` 경로 → 자동으로 fresh thread 시작 | (수동) |
| app-server → exec fallback | app-server 연결 실패 강제 (포트 점유 등) | `classifyCodexAppServerFailure` 경로 → exec 모드로 자동 전환 | pm2 로그에 "falling back to exec mode" 확인 |
| permission approve | app-server 환경에서 yolo 외 정책으로 명령 시도 | `item/commandExecution/requestApproval` 수신 → `Permission` 행 생성 → 승인 시 turn 재개 | (수동) |
| permission deny | 동일 위에서 deny 결정 | turn 중단되고 `Permission.state='denied'` | (수동) |
| abort during turn | 진행 중 turn에 abort 액션 | `createCodexAppServerAbortPromise` → 소켓 close 1000 → `terminateCodexAppServerProcess` SIGTERM 후 SIGKILL, 이후 메시지 append 없음 | (수동) |
| turn timeout | `CODEX_TURN_TIMEOUT_MS` 초과 turn | `runStatus='timed_out'`, `turn_status: timed_out` ndjson 기록 | (수동) |
| exec 모드 전용 | `CODEX_RUNTIME_MODE=exec` 환경에서 turn | `codex exec --json` stdout 라인 → 동일한 SessionChatEvent 시퀀스 (run_started → Text Reply → completed) | (수동) |
| 동시 chat의 thread 분리 | 같은 session에 두 chat을 만들고 각각 turn 실행 | `buildCodexThreadCacheKey(sessionId, chatId)`로 분리, thread 섞이지 않음 | (수동) |
| 세션 종료 cleanup | 세션 종료 시 `clearCodexThreadsForSession` | 해당 sessionId 접두 thread cache 항목 모두 삭제 | (수동) |

## ndjson 로그 보존

다음 로그 파일 포맷은 외부 도구 호환성을 위해 변경 금지 (Phase 2 invariants):

```
logs/{YYYY}/{MM}/{DD}/chat-codex-{chatId}-{threadId}-parsed.ndjson
logs/{YYYY}/{MM}/{DD}/chat-codex-{chatId}-{threadId}-raw.ndjson
```

| stage | turnStatus 예시 | 의미 |
|---|---|---|
| `run_status` | `run_started` / `completed` / `failed` / `aborted` / `timed_out` / `retrying` / `fallback_to_exec` / `run_stale_cleanup` | run 라이프사이클 마커 |
| `turn_status` | `turn_started` / `completed` / `failed` / `turn_incomplete` | turn 라이프사이클 마커 |
| `incoming_payload` | — | raw payload (parseError 또는 정상 payload) |
| `parsed_append` | — | runtime이 `appendAgentMessage`로 enqueue한 메시지 |

## 실행 명령

```bash
# 자동 회귀
cd services/aris-backend
npx tsc --noEmit
npx vitest run --exclude '**/*.e2e.test.ts'

# (선택) 모듈별 conformance 단독
npx vitest run tests/codexProtocolMapper.test.ts
npx vitest run tests/codexPermissionBridge.test.ts

# 운영 dev proxy 수동 검증
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env \
  bash deploy/deploy_backend_zero_downtime.sh
# 이후 codex 세션 생성 후 위 표의 Case별로 prompt 전송
```

## Phase 2 운영 회귀 (직접 측정)

직전 Phase 2 sprint들에서 dev proxy로 다음을 직접 통과 확인:

| Sprint | 시나리오 | 결과 |
|---|---|---|
| Sprint 4 | "Just say hi back, nothing else." → "Hi" | ✓ user / run_started / Text Reply / completed 4건 persist |
| Sprint 5 | "Reply with just one word: OK" → "OK" + 자체 file_read | ✓ user / run_started / File Read tool / Text Reply / completed |
| Sprint 6 | "Reply with exactly: SPRINT6" → "SPRINT6" | ✓ user / run_started / Text Reply / completed (11s) |

세 sprint 모두 회귀 0건. 추출된 5개 codex 모듈 (`codexProtocolMapper`, `codexAppServerClient`, `codexAppServerLifecycle`, `codexPermissionBridge`, `codexRuntime`)이 실제 turn 실행 경로를 통과하는 것이 입증됨.

## 비고

- 실제 codex CLI 인증 상태(`codex login`)와 OpenAI API 가용성은 본 매트릭스의 자동 테스트 범위 밖이다.
- `CODEX_RUNTIME_MODE=app-server-strict`는 fallback 분기를 강제 비활성화 — 운영 디버그용이며 일반 케이스 수동 검증에는 사용하지 않는다.
- happy-server 외부 컨테이너 의존성은 Phase 2.5h(#298)에서 완전 제거됨. 본 매트릭스는 PrismaRuntimeStore 기반의 단일 backend를 전제로 한다.

## 후속 작업 (Sprint 8 — 선택)

- 위 수동 케이스 중 abort / timeout / missing-thread / fallback 경로의 **실제 운영 trace**를 캡처해 `tests/fixtures/codex/*.jsonl`로 고정.
- 캡처된 fixture를 `codexProtocolMapper.test.ts`에 추가하여 합성 fixture만이 아닌 실제 payload shape에 대한 conformance 보장.
- 본 매트릭스의 자동 검증 컬럼에 fixture 출처 표기 갱신.
