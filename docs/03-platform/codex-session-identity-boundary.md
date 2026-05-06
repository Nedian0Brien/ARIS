# Codex Session Identity Boundary

## 목적

Codex runtime에서 ARIS 내부 correlation id, Codex `threadId`, 그리고 ARIS 세션 UUID 사이의 경계를 명확히 고정한다.

## 원칙

- ARIS는 codex turn 시작 시 codex가 발급한 실제 `threadId`만 thread cache에 저장한다.
- codex가 `threadId`를 발급하기 전에는 어떤 synthetic id도 `threadId`로 승격되지 않는다.
- thread cache key는 `(sessionId, chatId)` 페어로 고정한다 — 동일 세션 내 다른 chat의 thread를 섞지 않는다.
- 실패한 turn에서도 마지막으로 observed된 `threadId`는 보존한다. 다음 turn은 그 값을 `codex exec resume <threadId>`로 사용할 수 있어야 한다.
- `app-server` 채널의 JSON-RPC `request_id`는 process 단위 correlation 용도이며 절대 `threadId`나 ARIS sessionId로 승격하지 않는다.
- `exec` 채널의 stdin/stdout 라인 단위 `id` 역시 동일 — local correlation 전용.

## 채널별 동작

Codex는 두 가지 실행 채널을 가진다.

### app-server 채널 (`CODEX_RUNTIME_MODE=app-server`, default)

- ARIS가 `127.0.0.1:<random>`에 임시 포트를 reserve, codex `app-server`를 spawn한 뒤 WebSocket으로 연결한다.
- `thread/start` 또는 `thread/resume` 응답의 `threadId`를 thread cache에 기록한다.
- 모든 후속 JSON-RPC 메시지는 그 `threadId`에 종속된다.

### exec 채널 (`CODEX_RUNTIME_MODE=exec`)

- `codex exec --json <prompt>` (fresh) 또는 `codex exec resume <threadId> --json <prompt>` (resume) 형태로 직접 spawn한다.
- stdout JSON 라인 중 `thread.start` / `thread.resume` 이벤트에서 `threadId`를 추출한다.
- exec 채널의 stdout은 한 turn 종료 후 EOF로 마무리된다.

## 현재 동작 (이 문서가 작성된 시점)

- thread cache: `buildCodexThreadCacheKey(sessionId, chatId)`로 키 생성, in-process Map.
- 두 채널 공통: turn 시작 시 cache에 저장된 `threadId`가 있으면 resume, 없으면 fresh.
- `isMissingCodexThreadError(error)` true이면 cache 무효화 후 1회 fresh 재시도 (line 5368).
- ARIS `sessions.provider_state` JSON 컬럼에 `{ threadId: "..." }`로 영속화 (현재는 `app-server` 경로만 영속화 — `exec` 경로는 in-process cache만 사용 중인지 추후 검증 필요).

## 구현 기준

- 인라인 코드 위치 (Phase 2 추출 대상):
  - 환경 상수: `services/aris-backend/src/runtime/happyClient.ts:80-118`
  - thread cache 키 빌더: `buildCodexThreadCacheKey` (`happyClient.ts:1357` 부근)
  - missing-thread retry 분기: `happyClient.ts:5368`
  - exec spawn 인라인: `happyClient.ts:4221`
  - app-server WebSocket 라이프사이클: `happyClient.ts:1650-1900`
- Phase 2 정착 위치:
  - `services/aris-backend/src/runtime/providers/codex/codexLauncher.ts` — args 빌드
  - `services/aris-backend/src/runtime/providers/codex/codexThreadCache.ts` — cache key/store (Sprint 6에서 신설)
  - `services/aris-backend/src/runtime/providers/codex/codexSessionRegistry.ts` — observed threadId persistence

## 후속 방향

- exec 채널의 영속화 동작을 명시화한다 (현재 in-process Map만 사용 중인지, `provider_state` 영속화도 거치는지 추후 검증).
- `app-server` 채널의 `request_id` ↔ ARIS 내부 correlation id를 별도 메타로 분리해 confusion을 차단한다.
- `localCorrelationId`와 `threadId`를 혼동하지 않도록 persisted message 메타 키를 분리한다 (Claude alignment와 동일 방향).
