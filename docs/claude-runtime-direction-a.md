# Claude Runtime Direction A

## 목적

ARIS의 Claude 지원을 `happyClient.ts` 안의 일반 CLI 처리 분기에서 떼어내고, Happy 원본처럼 Claude 전용 세션 서브시스템으로 재구성한다.

이 문서는 두 가지를 정리한다.

1. Happy 원본이 Claude를 어떻게 다루는지
2. ARIS에서 이를 어떻게 옮기면서 `happyClient.ts` 비대화를 줄일지

## 현재 문제

현재 ARIS의 Claude 지원은 `services/aris-backend/src/runtime/happyClient.ts` 내부의 일반 `runAgentCli()` 경로에 얹혀 있다.

- Claude 세션 발견, resume, 액션 스트림 파싱, 오류 처리, fallback 재호출이 한 파일에 섞여 있다.
- Codex는 전용 런타임 경로가 있지만 Claude는 사실상 "일반 CLI + 약한 세션 추론" 구조다.
- 그 결과 같은 세션 ID에 대해 중복 실행이나 fallback 재호출이 생기면 `Session ID already in use` 같은 충돌이 쉽게 난다.

현재 파일 크기:

- `services/aris-backend/src/runtime/happyClient.ts`: 약 3,700 lines

핵심 병목:

- provider 공통 로직과 provider 전용 로직이 섞여 있다.
- Claude 세션 lifecycle이 런타임의 1급 개념이 아니다.
- Claude 출력 파싱과 저장소 반영이 "실행 결과 해석" 수준이라, 세션 상태를 신뢰성 있게 추적하지 못한다.

## Happy 원본에서의 Claude 구조

Happy 원본은 Claude를 별도 서브시스템으로 다룬다.

주요 파일:

- `references/happy/packages/happy-cli/src/claude/session.ts`
- `references/happy/packages/happy-cli/src/claude/claudeLocalLauncher.ts`
- `references/happy/packages/happy-cli/src/claude/claudeRemoteLauncher.ts`
- `references/happy/packages/happy-cli/src/claude/utils/sessionScanner.ts`
- `references/happy/packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts`
- `references/happy/packages/happy-cli/src/api/apiSession.ts`
- `references/happy/docs/session-protocol-claude.md`

Happy의 중요한 특징:

1. Claude 세션 객체가 따로 있다.
   - `Session`이 `sessionId`, mode, keepAlive, session-found callback을 가진다.
   - 세션 발견은 CLI 출력 추론이 아니라 hook/event 기반으로 갱신된다.

2. local launcher와 remote launcher가 분리돼 있다.
   - local: Claude 로컬 프로세스 + session scanner
   - remote: SDK stream + ordered outgoing queue

3. Claude 원본 로그(JSONL)를 직접 읽는다.
   - `sessionScanner`가 세션 파일을 tail하면서 dedupe까지 담당한다.
   - 즉 "최종 stdout 문자열"이 아니라 Claude의 실제 세션 로그를 canonical source로 삼는다.

4. Claude 전용 protocol mapper가 있다.
   - `sessionProtocolMapper`가 Claude raw log를 session protocol envelope으로 변환한다.
   - tool call, turn start/end, sidechain/subagent까지 Claude semantics에 맞게 처리한다.

5. one-time flag 소비와 세션 전환이 분리돼 있다.
   - `--resume`, `--continue`, `--session-id`를 spawn 전에 정리하고
   - spawn 후에는 동일 flag를 계속 재사용하지 않는다.

결론적으로 Happy는 Claude를 "일반 CLI 실행기"가 아니라 "세션 로그를 가진 stateful runtime"으로 취급한다.

## ARIS와의 구조 차이

### 현재 ARIS

- 공통 오케스트레이터: `HappyRuntimeStore`
- Codex: 전용 실행/이벤트 경로 존재
- Claude: `runAgentCli()` 공통 경로 재사용
- 출력 원천: stdout/stderr + stream-json 파싱
- 세션 추적: 앱 내부 추론 및 일부 metadata 저장

### Happy 원본

- Claude 전용 session 객체
- Claude 전용 launcher
- Claude 전용 log scanner
- Claude 전용 protocol mapper
- session start hook 기반 세션 발견

즉, 현재 ARIS는 Happy의 Claude 하위 계층을 재현하지 않고, 결과 일부만 얇게 흉내 낸 상태다.

## Direction A 목표 구조

`happyClient.ts`를 오케스트레이터로 축소하고, Claude는 전용 adapter subtree로 분리한다.

### 제안 디렉터리

```text
services/aris-backend/src/runtime/
  happyClient.ts
  providers/
    claude/
      claudeRuntime.ts
      claudeSessionRegistry.ts
      claudeSessionController.ts
      claudeLauncher.ts
      claudeSessionScanner.ts
      claudeProtocolMapper.ts
      claudeTypes.ts
    codex/
      codexRuntime.ts
      codexAppServer.ts
      codexExecCli.ts
      codexEventMapper.ts
```

### 역할 분리

1. `happyClient.ts`
   - provider 선택
   - 세션/메시지 저장소 연결
   - permission/request 공통 인터페이스 유지
   - provider adapter 호출만 수행

2. `claudeRuntime.ts`
   - ARIS용 Claude provider 진입점
   - `sendTurn`, `abortTurn`, `isRunning`, `recoverSession` 같은 API 제공

3. `claudeSessionRegistry.ts`
   - `(sessionId, chatId)` 기준 controller 단일화
   - 동일 채팅에 대한 동시 실행 차단

4. `claudeSessionController.ts`
   - Claude session lifecycle owner
   - session id 발견/변경
   - active turn 상태
   - abort/cleanup

5. `claudeLauncher.ts`
   - spawn 규칙 담당
   - `--resume`, `--continue`, `--session-id` 정책
   - one-time flag 소비
   - 동일 turn 내 fallback 정책 제어

6. `claudeSessionScanner.ts`
   - Happy의 `sessionScanner`를 참고해 Claude JSONL 파일을 tail
   - dedupe 및 ordered delivery 보장

7. `claudeProtocolMapper.ts`
   - Happy의 `sessionProtocolMapper` 개념을 ARIS `RuntimeMessage` 포맷에 맞게 축소 포팅
   - tool-call-start/end, text, turn-start/end를 Claude 원본 이벤트 기준으로 매핑

## 세션 모델 제안

ARIS도 Claude를 아래 상태 머신으로 다뤄야 한다.

```text
idle
  -> starting
  -> running
  -> completing
  -> idle

starting/running
  -> aborting
  -> idle

starting/running
  -> failed
  -> idle
```

추가 상태:

- `claudeSessionId`: Claude가 실제 사용하는 세션 ID
- `turnId`: 현재 ARIS turn
- `launcherMode`: `new` | `resume`
- `sessionSource`: `hook` | `scanner` | `stored`

중요 원칙:

- session id는 provider가 발견한 실제 값만 저장한다.
- 동일 `(sessionId, chatId)`에는 controller 하나만 존재한다.
- 같은 turn 안에서 두 번째 Claude 프로세스를 다시 띄우지 않는다.
- fallback은 "같은 세션으로 재호출"이 아니라 "기존 로그/스트림 보강" 방식으로 제한한다.

## 구현 전략

### Phase 1. 세션 전용 경계 만들기

- `claudeRuntime.ts`, `claudeSessionRegistry.ts`, `claudeTypes.ts` 추가
- `happyClient.ts`에서 Claude 관련 분기만 분리
- 기존 public API는 유지

목표:

- `generateAndPersistAgentReply()`에서 Claude-specific branch가 별도 클래스로 이동

### Phase 2. 세션 발견/추적을 hook + scanner 기반으로 전환

- Happy의 `SessionStart` hook 아이디어 도입
- Claude JSONL 세션 로그 위치를 canonical source로 사용
- `threadId` 필드를 사실상 `claudeSessionId`로 재정의

목표:

- UUID 합성/추론 제거
- 실제 세션 파일 기반 resume

### Phase 3. protocol mapper 도입

- raw Claude 로그를 ARIS `RuntimeMessage`로 변환하는 mapper 작성
- 현재 `parseAgentStreamLine`, `parseAgentStreamOutput`의 Claude 의존 부분 제거

목표:

- stdout 최종 문자열에 의존하지 않고 action/text/turn 이벤트 반영

### Phase 4. fallback 제거 또는 provider-aware 축소

- Claude 생성 턴에서 동일 session id fallback 재호출 금지
- 필요하면 fallback은 로그 스캔 보강이나 요약 보강만 수행

목표:

- `Session ID already in use`의 구조적 원인 제거

### Phase 5. `happyClient.ts` 축소

`happyClient.ts`에서 아래를 provider 디렉터리로 이동한다.

- Claude launch rules
- Claude stream parsing
- non-Codex action inference 중 Claude 전용 부분
- Claude retry/session-in-use 처리

최종적으로 `happyClient.ts`에는 아래만 남긴다.

- HTTP storage bridge
- provider dispatch
- permission/request 공통 처리
- Codex/Claude/Gemini adapter 공통 계약

## `happyClient.ts` 비대화 해소 방안

현재 파일 비대화의 본질은 "계층이 없다"는 점이다.

분해 기준:

1. 공통 유틸
   - text parsing
   - diff summarization
   - metadata normalization

2. 공통 저장소 브리지
   - list/get/append/apply action/isRunning

3. provider adapter
   - codex
   - claude
   - gemini

4. provider-specific mapper
   - codex event mapper
   - claude protocol mapper

5. provider-specific lifecycle
   - codex run controller
   - claude session controller

권장 목표:

- `happyClient.ts`를 1,000~1,500 line 수준의 orchestration 파일로 축소
- Claude 로직은 4~6개 파일로 분리
- 테스트도 provider별 디렉터리로 이동

## 왜 Happy 방식이 더 맞는가

Happy 원본은 Claude를 이미 다음 전제로 다룬다.

- Claude는 session-aware runtime이다.
- stdout 하나만 보면 안 된다.
- 세션 파일/SDK stream/hook을 함께 써야 한다.
- turn lifecycle과 session lifecycle을 분리해야 한다.

ARIS도 이 전제를 받아들여야 Claude가 안정화된다.

지금처럼 `runAgentCli()` 공통 추상화 안에 Claude를 우겨 넣으면,

- 세션 발견
- resume
- fallback
- 중복 실행 방지
- tool event 정규화

가 계속 서로 충돌한다.

## 권장 다음 단계

1. Claude adapter 파일 골격부터 추가
2. `generateAndPersistAgentReply()`의 Claude 분기를 adapter로 이동
3. session registry/controller 도입
4. 합성 session id 제거
5. scanner + hook 기반 실제 session id 추적 도입
6. fallback 재호출 제거
7. Claude provider 테스트 추가

## 구현 전 확인할 점

- ARIS 서버 환경에서 Claude JSONL 세션 파일 위치를 안정적으로 찾을 수 있는지
- hook server를 백엔드 프로세스 안에서 직접 열지, 별도 helper process로 둘지
- 현재 ARIS 메시지 카드 포맷이 Happy session protocol을 어느 정도까지 받아들일 수 있는지
- 원본 Happy 코드를 직접 포팅할지, 구조만 참고해 ARIS 맞춤 구현을 할지

## 결론

Claude 지원을 안정화하려면 "Codex와 비슷한 전용 경로" 정도가 아니라, Happy가 이미 하고 있는 것처럼 Claude를 독립 세션 서브시스템으로 승격해야 한다.

가장 중요한 변화는 세 가지다.

1. Claude를 일반 CLI 경로에서 분리
2. 세션 ID를 추론하지 말고 실제 Claude 세션 source에서 추적
3. `happyClient.ts`를 orchestration 계층으로 축소

이 방향이면 현재의 세션 충돌 문제와 `happyClient.ts` 비대화 문제를 동시에 풀 수 있다.
