# Codex Protocol Conformance

Codex provider raw payload는 adapter 내부에서만 해석한다. 상위 레이어는 canonical envelope와 canonical `threadId`만 소비한다.

## Happy 불변식

- fresh codex turn은 raw provider key casing/형식에 의존하지 않는다.
- observed codex `threadId`는 실패한 turn에서도 보존된다.
- `app-server` JSON-RPC `request_id`와 `exec` 라인 `id`는 provider identity로 승격되지 않는다.
- `app-server` mapper와 `exec` mapper는 동일한 canonical `SessionProtocolEnvelope` 시퀀스를 도출해야 한다.
- approval policy 변환은 한 곳(`normalizeCodexApprovalPolicy`)에서만 수행한다.

## 채널 매핑

Codex의 두 채널(`app-server`, `exec`)은 raw payload shape이 다르지만 ARIS 상위 레이어는 동일한 `SessionProtocolEnvelope`(turn-start / turn-end / tool-call-start / tool-call-end / text / stop) 시퀀스를 받는다.

| Codex 이벤트 | app-server raw | exec raw | canonical envelope |
|---|---|---|---|
| 턴 시작 | `thread/start` 또는 `thread/resume` 응답 | stdout 첫 `thread.started` JSON | `turn-start` |
| assistant 텍스트 | `agent_message` 또는 `agent_message_delta` notification | stdout `agent_message` 라인 | `text` |
| tool call (file_write 등) | `tool_call` notification | stdout `tool_call` 라인 | `tool-call-start` / `tool-call-end` |
| permission 요청 | `permission_request` notification (서버 측 JSON-RPC request) | stdout `permission_request` 라인 | side-effect: `request_permission` |
| 턴 종료 | `task_complete` notification | stdout `task_complete` + EOF | `turn-end` |
| 턴 오류 | JSON-RPC error 또는 `task_error` | stdout `task_error` | `turn-end` (stopReason='error') |
| 비-thread 오류 | "no thread with id ..." 등 | 동일 | retry 분기 (Identity Boundary 참고) |

## 구현 경계

- raw key variation (`thread_id`, `threadId`, `request_id`, `requestId`, …)은 `services/aris-backend/src/runtime/providers/codex/codexProtocolFields.ts`에서만 정규화한다 (Sprint 3에서 신설).
- `codexProtocolMapper.ts`는 위 정규화를 사용해 두 채널을 동일한 envelope 시퀀스로 매핑한다 (Sprint 3).
- fixture 기반 conformance 테스트는 `services/aris-backend/tests/fixtures/codex/*.jsonl` raw trace를 canonical behavior로 고정한다 (Sprint 3).

## Trace 출처 (예정)

다음 시나리오의 raw fixture를 Sprint 3에서 캡처해 conformance 테스트로 고정한다.

- `app-server-thread-start.jsonl` — fresh turn, JSON-RPC `thread/start` 응답.
- `app-server-thread-resume.jsonl` — resume turn, `thread/resume` 응답 + 후속 notifications.
- `app-server-permission-request.jsonl` — server-initiated `permission_request` 후 client `permission_response`.
- `app-server-tool-call-file-write.jsonl` — file_write tool call의 start/end notification 시퀀스.
- `app-server-task-error-missing-thread.jsonl` — "no thread with id" 오류 (retry 분기 검증).
- `exec-thread-started-and-completed.jsonl` — exec 채널 fresh turn, EOF까지.
- `exec-tool-call-and-permission.jsonl` — exec 채널 tool_call + permission_request 라인 형태.

## 환경 변수 영향

| 변수 | 기본값 | 영향 |
|---|---|---|
| `CODEX_RUNTIME_MODE` | `app-server` | `app-server` 또는 `exec`. 어댑터의 채널 선택. |
| `CODEX_SANDBOX_MODE` | `workspace-write` | `-s` 인자로 전달. `yolo` approval policy 시 `danger-full-access`로 강제. |
| `CODEX_APPROVAL_POLICY` | `on-request` | 기본 fallback approval policy (session에 명시 없을 때). |
| `CODEX_TURN_TIMEOUT_MS` | 30분 | turn wall-clock guard. activity-based가 아니므로 추후 검토. |
| `CODEX_APP_SERVER_POST_TURN_QUIET_MS` | 250 | turn-end 이후 quiet window. |
| `CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS` | 1500 | drain 단계 최대 대기. |

## 후속 검토

- `CODEX_TURN_TIMEOUT_MS`의 activity-based 변환 (Gemini alignment와 동일 방향).
- exec 채널 영속화 일관성 점검 — Identity Boundary 문서의 "후속 방향" 참고.
