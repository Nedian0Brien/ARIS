# 제목
Claude 전용 런타임 분리와 happyClient 해체 리팩토링 로드맵

# 본문
## 배경
현재 ARIS의 Claude Code 지원은 `services/aris-backend/src/runtime/happyClient.ts` 내부의 일반 CLI 실행 흐름에 묶여 있습니다. 이 구조에서는 세션 생성, resume, 액션 파싱, fallback 재호출, 저장소 반영이 한 파일과 한 흐름에 뒤섞여 있어 Claude를 상태를 가진 런타임으로 안정적으로 다루기 어렵습니다.

이미 실제 장애로 `Session ID already in use`가 확인되었습니다. 특히 같은 turn 안에서 Claude를 동일 session id로 다시 실행하는 fallback 경로가 존재해 첫 요청에서도 세션 충돌이 발생할 수 있었습니다.

Happy 원본은 Claude를 일반 CLI 분기로 취급하지 않고, `Session`, launcher, scanner, protocol mapper 등 전용 서브시스템으로 분리해 관리합니다. ARIS도 이 방향으로 구조를 전환해야 합니다.

## 문제
- `happyClient.ts`가 과도하게 비대하며 provider별 책임이 섞여 있음
- Claude session lifecycle의 source of truth가 불명확함
- 동일 세션에 대한 중복 실행과 fallback 재호출이 구조적으로 발생 가능함
- stdout 파싱 의존도가 높아 Claude 세션 로그/이벤트를 정규 source로 활용하지 못함
- Codex와 Claude가 서로 다른 성격의 런타임인데도 경계가 충분히 분리되어 있지 않음

## 목표
- Claude를 `happyClient.ts` 밖의 전용 provider subtree로 완전히 분리
- Claude session lifecycle을 실제 Claude source 기반으로 관리
- `(sessionId, chatId)` 단위 단일 실행 보장
- 동일 turn 내 fallback 재호출 제거
- `happyClient.ts`를 orchestration + storage bridge + provider dispatch 중심으로 축소

## 구현 로드맵
### Phase 0
- Claude 전용 진입점 분리 시작
- 동일 turn fallback 재호출 제거
- 상태: 완료

### Phase 1
- `claudeSessionRegistry` 도입
- `claudeSessionController` 도입
- Claude active run, abort, wait, isRunning 로직을 `happyClient.ts` 밖으로 이동
- 완료 기준: Claude run lifecycle이 `happyClient.ts`의 공용 activeRuns 의존 없이 동작

### Phase 2
- `claudeLauncher` 분리
- `--resume`, `--continue`, `--session-id` 정책을 launcher 책임으로 이동
- retry와 session-in-use 처리 규칙 정리
- 완료 기준: Claude spawn 규칙이 `happyClient.ts`에서 제거됨

### Phase 3
- 실제 Claude session source 추적 경로 도입
- hook 또는 session source abstraction으로 실제 Claude session id 수집
- 완료 기준: 앱이 합성한 식별자가 아니라 실제 Claude session id를 저장하고 재사용

### Phase 4
- `claudeSessionScanner` 도입
- Claude JSONL/session 로그를 canonical source로 읽기
- dedupe, ordered tail, resumed session 처리
- 완료 기준: stdout 최종 문자열 의존도를 낮추고 session log 기반 수집 가능

### Phase 5
- `claudeProtocolMapper` 도입
- raw Claude event/log를 ARIS `RuntimeMessage`로 매핑
- text, tool-call-start, tool-call-end, turn-close 등 provider 이벤트 정규화
- 완료 기준: Claude-specific parse 로직이 `happyClient.ts`에서 제거됨

### Phase 6
- `happyClient.ts` 공통 계층 정리
- provider dispatch, storage bridge, 공통 유틸만 남기고 Claude 세부 구현 제거
- 완료 기준: `happyClient.ts`가 오케스트레이션 중심 파일로 축소

### Phase 7
- Codex/Gemini 경계 정리
- provider subtree 구조를 일관되게 정돈
- 완료 기준: provider별 책임 경계가 명확해지고 `happyClient.ts` 해체 리팩토링 마무리

### Phase 8
- 실환경 검증
- Claude 새 채팅, 멀티턴, 빠른 재전송, 중단 직후 재전송 회귀 테스트
- 문서 업데이트 및 임시 호환 코드 제거
- 완료 기준: 실사용 기준에서 세션 충돌 재현이 제거되고 구조 문서가 최신화됨

## 완료 조건
- Claude가 generic CLI 분기가 아닌 전용 runtime subtree로 동작
- 세션 충돌과 동일 turn 재호출 문제가 구조적으로 차단됨
- `happyClient.ts`가 provider 세부 구현 없이 얇은 orchestration 레이어로 축소됨
- 자동 테스트와 실환경 검증이 모두 통과함

## 참고
- Happy reference의 Claude session/launcher/scanner 구조를 기준으로 설계
- 기존 조사 결과: `Session ID already in use`는 고정 session id 재사용과 동일 turn fallback 재호출이 결합되어 발생
