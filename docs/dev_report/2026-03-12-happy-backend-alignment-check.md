# ARIS Backend vs Happy Alignment Check

## 범위

- 대상: `services/aris-backend/src/runtime/*`
- 비교 기준:
  - ARIS: 현재 `main`의 backend runtime 구현
  - Happy: `/home/ubuntu/project/ARIS/references/happy` 원본 소스

직접 읽은 Happy 핵심 파일:

- `references/happy/packages/happy-cli/src/claude/session.ts`
- `references/happy/packages/happy-cli/src/claude/claudeLocalLauncher.ts`
- `references/happy/packages/happy-cli/src/claude/claudeRemoteLauncher.ts`
- `references/happy/packages/happy-cli/src/claude/utils/sessionScanner.ts`
- `references/happy/packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts`
- `references/happy/packages/happy-cli/src/api/apiSession.ts`
- `references/happy/docs/session-protocol-claude.md`

## 한 줄 결론

ARIS는 Claude 관련 파일 경계와 일부 책임 분리에서는 Happy 방향으로 움직였지만, 실제 런타임 모델은 아직 Happy와 부분 정렬 수준이다. 가장 큰 차이는 Happy가 Claude를 `Session + local/remote launcher + session-protocol emitter`로 다루는 반면, ARIS는 여전히 `happyClient.ts` 중심의 CLI orchestration 위에 Claude subtree를 얹은 구조라는 점이다.

## 현재 정렬된 부분

### 1. Claude 전용 subtree가 존재한다

현재 ARIS에는 Claude 전용 subtree가 존재한다.

- `services/aris-backend/src/runtime/providers/claude/claudeRuntime.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeLauncher.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionRegistry.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionController.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeProtocolMapper.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeOrchestrator.ts`

이 점은 Happy의 "Claude를 별도 서브시스템으로 다룬다"는 방향과 맞는다. 다만 Happy의 `Session` 객체 중심 구조까지는 아직 가지 않았다.

### 2. Claude 실행 lifecycle을 위한 별도 registry/controller가 있다

`ClaudeSessionRegistry`와 `ClaudeSessionController`가 생겨 `(sessionId, chatId)` 단위 실행 교체, abort, stale cleanup, running 판별을 담당한다.

이는 이전의 `happyClient.ts` 단일 active run 맵에 비해 개선이다. 하지만 Happy의 `Session`이 들고 있는 `mode`, `keepAlive`, `sessionFound callback`, `claudeArgs 소비`까지 포함한 풍부한 세션 객체와는 아직 차이가 있다.

### 3. Claude launcher 정책이 provider 파일로 분리돼 있다

`claudeLauncher.ts`가 `--resume` / `--session-id`, permission mode, retry 정책을 들고 있다.

이 점은 Happy의 launcher 분리 방향과 닮아 있다. 다만 Happy는 `claudeLocalLauncher`와 `claudeRemoteLauncher`를 분리하지만 ARIS는 단일 launcher만 가진다.

### 4. Claude scanner와 mapper라는 대응 파일이 존재한다

- `claudeSessionScanner.ts`
- `claudeProtocolMapper.ts`

즉 최소한 이름과 파일 책임 수준에서는 Happy의 `sessionScanner`, `sessionProtocolMapper`에 대응되는 계층이 ARIS에도 생겼다.

### 5. Claude turn orchestration 일부가 `happyClient.ts` 밖으로 이동했다

`claudeOrchestrator.ts`가 thread recovery, action thread id 계산, provider turn orchestration 일부를 맡고 있다.

Direction A의 1차 목표였던 "provider-specific orchestration extraction"은 어느 정도 달성됐다.

## 아직 어긋난 부분

### 1. `happyClient.ts` 중심 구조가 그대로 남아 있다

현재 파일 크기:

- `services/aris-backend/src/runtime/happyClient.ts`: 3675 lines

Claude 관련 파일이 분리됐지만, 실제 핵심 orchestration은 여전히 `happyClient.ts`에 많이 남아 있다.

남아 있는 대표 책임:

- Happy HTTP storage bridge
- Codex app-server / exec runtime
- non-Codex command execution
- message persistence
- permission coordination
- provider dispatch 일부
- Claude action append / message append 통합 흐름

즉 Happy처럼 provider runtime이 충분히 독립돼 있다고 보기 어렵다. 현재 구조는 "분리된 provider 파일을 `happyClient.ts`가 강하게 조립하는 형태"에 더 가깝다.

### 2. Happy의 `Session` 객체에 해당하는 중심 세션 모델이 없다

Happy의 `Session`은 다음을 한 객체에서 관리한다.

- `sessionId`
- `mode: local | remote`
- keepAlive
- `onSessionFound`
- one-time Claude flag 소비
- scanner callback wiring

ARIS는 이 역할이

- `claudeSessionSource.ts`
- `claudeSessionRegistry.ts`
- `claudeSessionController.ts`
- `claudeOrchestrator.ts`
- `happyClient.ts`

로 흩어져 있다. 기능 일부는 존재하지만 Happy처럼 한 세션 객체가 lifecycle의 source of truth 역할을 하지 않는다.

### 3. local / remote launcher 분리가 전혀 없다

Happy는:

- `claudeLocalLauncher.ts`
- `claudeRemoteLauncher.ts`

를 분리하고, remote에서는 SDK stream과 `OutgoingMessageQueue`를 사용한다.

ARIS는 현재:

- `claudeLauncher.ts`
- `claudeRuntime.ts`

만 있고, local/remote mode 개념도 없다.

즉 Happy의 중요한 특징인:

- mode switching
- ordered outgoing queue
- remote SDK stream
- permission response coupling

이 빠져 있다.

### 4. Claude session source가 아직 synthetic seed에 크게 의존한다

`claudeSessionSource.ts`는 새 turn에서 여전히 결정적 synthetic UUID를 만들어 `--session-id`로 시작한다.

Happy 실제 구현의 핵심은 SessionStart hook으로 Claude session id를 발견하고 세션 객체에 반영하는 것이다.

반면 ARIS는 아직 시작 시점에 synthetic UUID를 만들어 bootstrap 한다.

Happy 방향의 구조는:

- hook 또는 실제 provider source에서 session id 발견
- 그 실제 값을 canonical source로 유지

현재 ARIS는 observed session id를 나중에 저장하긴 하지만, 시작 시점의 source of truth는 아직 앱이 만든 synthetic id다.

### 5. scanner가 Happy 수준의 live canonical log tailer는 아니다

`claudeSessionScanner.ts`는 현재:

- project dir 계산
- hinted/recent session file 탐색
- JSONL 파일 전체 읽기
- session id 존재 여부 확인

정도에 가깝다.

Happy 설계의 scanner와 비교하면 아직 부족한 점:

- file watcher 기반 지속 감시
- live tail
- ordered delivery
- line-level dedupe
- multi-session resume stitching
- session log를 실시간 canonical event source로 사용

Happy의 `sessionScanner.ts`는 실제로 watcher, processed key dedupe, pending/finished session 추적까지 수행한다. 현재 ARIS scanner는 그보다 훨씬 얕다.

### 6. protocol mapper가 Happy의 session-protocol mapper와는 성격이 다르다

`claudeProtocolMapper.ts`는 현재:

- assistant text 추출
- action 추론
- session id 추출

정도를 수행한다.

Happy의 `sessionProtocolMapper.ts`는:

- `SessionEnvelope` 생성
- `turn-start` / `turn-end`
- `tool-call-start` / `tool-call-end`
- `subagent`
- sidechain orphan buffering
- provider subagent id -> session subagent id 매핑

을 수행한다.

즉 ARIS mapper는 아직 "stream parser"이고, Happy mapper는 "session protocol adapter"다.

부족한 점:

- turn-start / turn-end envelope 중심 처리
- sidechain / subagent 계층
- richer tool-call lifecycle
- raw Claude event를 provider-neutral session protocol로 정규화하는 단계

현재는 여전히 "CLI stream-json 해석기" 성격이 강하다.

### 7. Happy의 API bridge 계층이 ARIS backend에는 없다

Happy의 `ApiSessionClient.sendClaudeSessionMessage()`는 Claude raw log를 `SessionEnvelope`로 바꿔 전송한다.

ARIS backend는 반대로:

- tool/text를 곧바로 `appendAgentMessage()`
- meta에 `sessionEventType`, `streamEvent` 등을 붙여 저장

하는 구조다.

즉 Happy는 protocol-first, ARIS는 persisted-message-first 구조다.

### 8. provider 경계가 Claude에만 부분 적용돼 있다

Claude는 subtree가 생겼지만, Codex는 여전히 `happyClient.ts` 내부에 대규모 전용 로직이 남아 있다.

즉 전체 런타임 아키텍처는 아직:

- Claude: 부분 분리
- Gemini: launcher만 분리
- Codex: 대부분 `happyClient.ts`

상태다.

Happy와 정렬된 provider architecture라고 보기에는 아직 비대칭이다.

## 현재 정렬 수준 평가

### Claude 기준

- 파일 구조 정렬도: 중간
- 런타임 모델 정렬도: 중간 이하
- 세션 프로토콜 정렬도: 낮음

평가 이유:

- 파일 이름과 일부 책임 분리는 따라갔다.
- 하지만 Happy의 핵심인 `Session`, local/remote split, session-protocol emitting까지는 아직 멀다.

### 전체 runtime 기준

- 구조 정렬도: 낮음에서 중간 사이
- 이유:
  - Claude subtree는 생겼다.
  - 그러나 `happyClient.ts` 중심 구조가 여전히 강하다.
  - Codex/Gemini까지 포함하면 provider architecture의 일관성이 부족하다.
  - Happy의 protocol-first runtime과는 아직 모델 차이가 크다.

## 우선순위 높은 후속 정렬 작업

### 1. Claude `Session`에 해당하는 중심 객체를 설계할 것

현재 흩어진 lifecycle 상태를 하나의 provider session owner로 모으는 게 우선이다.

포함돼야 할 책임:

- actual session id
- mode
- keepAlive 성격의 liveness state
- session found callback
- one-time flag 소비

### 2. Claude session source를 실제 provider source 중심으로 전환

우선순위가 가장 높다.

현재 synthetic `--session-id` 시작 의존을 줄이고:

- observed session id
- scanner 발견 값
- 가능하면 hook/source callback

를 canonical source로 올려야 한다.

### 3. `claudeSessionScanner.ts`를 watcher + tail + dedupe 구조로 확장

지금 scanner는 "사후 보정" 수준이다.

Happy와 더 맞추려면:

- incremental read offset
- line dedupe
- event ordering
- resumed session stitch

가 필요하다.

### 4. `claudeProtocolMapper.ts`를 session-protocol adapter로 재설계

지금은 text/action 추출기다.

다음 단계는:

- turn-start
- turn-end
- tool-call-start
- tool-call-end

를 raw Claude event 기준으로 더 명시적으로 매핑하는 것이다.

### 5. `happyClient.ts`를 provider dispatch 중심 파일로 더 축소

현재 크기와 책임 분포상 Direction A가 완전히 끝났다고 보기 어렵다.

남은 목표는:

- storage bridge
- provider dispatch
- permission 공통 인터페이스

정도만 남기고 provider-specific runtime은 밖으로 내보내는 것이다.

### 6. Codex/Gemini까지 provider boundary를 맞추기

Happy alignment를 "Claude만" 기준으로 끝내면 아키텍처가 비대칭으로 남는다.

적어도 다음을 맞춰야 한다.

- Codex runtime extraction
- Gemini runtime boundary 보강
- 공통 provider contract 정리

## 최종 판단

현재 ARIS는 Happy 원본과 비교했을 때 Claude 지원의 "파일 구조 방향"은 맞췄다.

하지만 런타임 모델은 아직 다르다.

가장 정확한 표현은 이렇다.

- ARIS는 Happy의 Claude 구조를 부분적으로 포팅했다.
- 그러나 Happy의 핵심인 `Session` 중심 설계, local/remote launcher 이원화, session-protocol emitting 구조는 아직 없다.
- 따라서 현재 상태는 "Happy와 정렬된 Claude subtree를 가진 ARIS 전용 runtime"이지, "Happy 런타임과 본질적으로 같은 구조"는 아니다.

즉 지금 상태는 "방향 정렬은 시작됐지만, 실제 구조 정렬은 아직 절반 이하가 남아 있는 상태"로 보는 편이 더 정확하다.
