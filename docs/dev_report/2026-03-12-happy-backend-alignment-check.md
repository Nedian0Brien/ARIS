# ARIS Backend vs Happy Alignment Check

## 범위

- 대상: `services/aris-backend/src/runtime/*`
- 비교 기준: 현재 저장소의 ARIS 구현과, 이전 설계 문서에 정리된 Happy Claude 구조
- 참고 문서:
  - `docs/claude-runtime-direction-a.md` 성격의 설계 초안이 남아 있는 기존 worktree
  - 현재 `main`의 Claude provider subtree

참고:

- 현재 `main` 체크아웃에는 `references/happy` 원본 소스가 직접 포함되어 있지 않았다.
- 따라서 이번 정렬 점검은 과거 설계 문서에 기록된 Happy 구조와 현재 ARIS 코드를 대조하는 방식으로 수행했다.

## 한 줄 결론

Claude 지원에 한정하면 ARIS는 Happy 방향으로 상당 부분 정렬됐다. 다만 아직 "Happy식 stateful session runtime"에 완전히 도달한 것은 아니고, 현재 상태는 "Claude provider subtree는 생겼지만, 공통 런타임과 session source of truth는 아직 Happy보다 단순한 상태"다.

## 현재 정렬된 부분

### 1. Claude가 더 이상 generic CLI 분기에 완전히 묻혀 있지 않다

현재 ARIS에는 Claude 전용 subtree가 존재한다.

- `services/aris-backend/src/runtime/providers/claude/claudeRuntime.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeLauncher.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionRegistry.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionController.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeProtocolMapper.ts`
- `services/aris-backend/src/runtime/providers/claude/claudeOrchestrator.ts`

이 점은 Happy의 "Claude를 별도 서브시스템으로 다룬다"는 방향과 맞는다.

### 2. Claude 실행 lifecycle이 1급 개념으로 분리되기 시작했다

`ClaudeSessionRegistry`와 `ClaudeSessionController`가 생겨 `(sessionId, chatId)` 단위 실행 교체, abort, stale cleanup, running 판별을 담당한다.

이는 이전의 `happyClient.ts` 단일 active run 맵에 비해 Happy의 session owner 개념에 더 가까워진 형태다.

### 3. Claude launcher 정책이 provider 쪽으로 이동했다

`claudeLauncher.ts`가 `--resume` / `--session-id`, permission mode, retry 정책을 들고 있다.

이 점도 Happy의 local launcher 분리 방향과 일치한다.

### 4. Claude scanner와 mapper가 분리돼 있다

- `claudeSessionScanner.ts`
- `claudeProtocolMapper.ts`

즉 stdout 파싱과 세션 로그 탐색이 최소한 파일 경계로는 분리됐다. Happy 원본의 `sessionScanner`, `sessionProtocolMapper`와 대응되는 계층이 ARIS에도 생긴 셈이다.

### 5. Claude 오케스트레이션이 `happyClient.ts` 밖으로 일부 빠졌다

`claudeOrchestrator.ts`가 thread recovery, action thread id 계산, provider turn orchestration 일부를 맡고 있다.

Direction A의 중간 목표였던 "provider-specific orchestration extraction"은 달성된 상태다.

## 아직 어긋난 부분

### 1. `happyClient.ts`가 여전히 너무 크다

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

즉 Happy처럼 provider runtime이 충분히 독립돼 있다고 보기 어렵다.

### 2. Claude session source가 아직 synthetic seed에 크게 의존한다

`claudeSessionSource.ts`는 새 turn에서 여전히 결정적 synthetic UUID를 만들어 `--session-id`로 시작한다.

Happy 방향의 이상적인 구조는:

- hook 또는 실제 provider source에서 session id 발견
- 그 실제 값을 canonical source로 유지

현재 ARIS는 observed session id를 나중에 저장하긴 하지만, 시작 시점의 source of truth는 아직 앱이 만든 synthetic id다.

### 3. scanner가 Happy 수준의 canonical log tailer는 아니다

`claudeSessionScanner.ts`는 현재:

- project dir 계산
- hinted/recent session file 탐색
- JSONL 파일 전체 읽기
- session id 존재 여부 확인

정도에 가깝다.

Happy 설계의 scanner와 비교하면 아직 부족한 점:

- live tail
- ordered delivery
- line-level dedupe
- multi-session resume stitching
- session log를 실시간 canonical event source로 사용

즉 지금 scanner는 "보정/복구용 탐색기"에 가깝고, 아직 "실시간 session bus"는 아니다.

### 4. protocol mapper가 Happy의 session protocol mapper보다 단순하다

`claudeProtocolMapper.ts`는 현재:

- assistant text 추출
- action 추론
- session id 추출

정도를 수행한다.

하지만 Happy식 mapper 대비 부족한 점:

- turn-start / turn-end envelope 중심 처리
- sidechain / subagent 계층
- richer tool-call lifecycle
- raw Claude event를 provider-neutral session protocol로 정규화하는 단계

현재는 여전히 "CLI stream-json 해석기" 성격이 강하다.

### 5. local / remote launcher 분리가 없다

Happy는 Claude local launcher와 remote launcher를 분리한다.

ARIS는 현재 `claudeLauncher.ts` 하나만 있고, local/remote 전개가 없다. 따라서:

- 다른 실행 채널 확장성
- ordered outgoing queue
- SDK stream 기반 전환

같은 구조적 이점은 아직 없다.

### 6. provider 경계가 Claude에만 부분 적용돼 있다

Claude는 subtree가 생겼지만, Codex는 여전히 `happyClient.ts` 내부에 대규모 전용 로직이 남아 있다.

즉 전체 런타임 아키텍처는 아직:

- Claude: 부분 분리
- Gemini: launcher만 분리
- Codex: 대부분 `happyClient.ts`

상태다.

Happy와 정렬된 provider architecture라고 보기에는 아직 비대칭이다.

## 현재 정렬 수준 평가

### Claude 기준

- 구조 정렬도: 중상
- 구현 정렬도: 중간
- 세션 모델 정렬도: 중간 이하

평가 이유:

- 파일 경계와 책임 분리는 상당히 따라갔다.
- 하지만 session source, scanner, mapper는 아직 Happy의 깊이까지 가지 못했다.

### 전체 runtime 기준

- 구조 정렬도: 중간
- 이유:
  - Claude subtree는 생겼다.
  - 그러나 `happyClient.ts` 중심 구조가 여전히 강하다.
  - Codex/Gemini까지 포함하면 provider architecture의 일관성이 부족하다.

## 우선순위 높은 후속 정렬 작업

### 1. Claude session source를 실제 provider source 중심으로 전환

우선순위가 가장 높다.

현재 synthetic `--session-id` 시작 의존을 줄이고:

- observed session id
- scanner 발견 값
- 가능하면 hook/source callback

를 canonical source로 올려야 한다.

### 2. `claudeSessionScanner.ts`를 실시간 tail + dedupe 구조로 확장

지금 scanner는 "사후 보정" 수준이다.

Happy와 더 맞추려면:

- incremental read offset
- line dedupe
- event ordering
- resumed session stitch

가 필요하다.

### 3. `claudeProtocolMapper.ts`를 session-protocol 중심으로 확장

지금은 text/action 추출기다.

다음 단계는:

- turn-start
- turn-end
- tool-call-start
- tool-call-end

를 raw Claude event 기준으로 더 명시적으로 매핑하는 것이다.

### 4. `happyClient.ts`를 provider dispatch 중심 파일로 더 축소

현재 크기와 책임 분포상 Direction A가 완전히 끝났다고 보기 어렵다.

남은 목표는:

- storage bridge
- provider dispatch
- permission 공통 인터페이스

정도만 남기고 provider-specific runtime은 밖으로 내보내는 것이다.

### 5. Codex/Gemini까지 provider boundary를 맞추기

Happy alignment를 "Claude만" 기준으로 끝내면 아키텍처가 비대칭으로 남는다.

적어도 다음을 맞춰야 한다.

- Codex runtime extraction
- Gemini runtime boundary 보강
- 공통 provider contract 정리

## 최종 판단

현재 ARIS는 Happy 원본과 비교했을 때 Claude 지원의 "방향"은 맞췄다.

하지만 아직 완전히 같은 수준의 session runtime은 아니다.

가장 정확한 표현은 이렇다.

- ARIS는 Happy의 Claude 구조를 부분적으로 포팅했고
- 가장 위험한 세션 충돌 문제는 상당 부분 줄였지만
- 아직도 `happyClient.ts` 중심 구조와 synthetic session bootstrap, 단순화된 scanner/mapper 때문에 완전 정렬 단계는 아니다.

즉 지금 상태는 "Direction A의 골격은 구현됐고, Happy 정렬의 마지막 30~40%가 남아 있는 상태"로 보는 게 맞다.
