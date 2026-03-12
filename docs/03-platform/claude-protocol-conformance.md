# Claude Protocol Conformance

Claude provider raw payload는 adapter 내부에서만 해석한다. 상위 레이어는 canonical envelope와 canonical `sessionId`만 소비한다.

## Happy 불변식

- fresh Claude turn은 raw provider key casing에 의존하지 않는다.
- observed Claude session id는 실패한 turn에서도 보존된다.
- synthetic/local correlation key는 provider identity로 승격되지 않는다.
- scanner와 stream mapper는 같은 observed session id를 도출해야 한다.

## 구현 경계

- raw key variation (`session_id`, `sessionId`, `sessionid`, `resume_session_id`, `resumeSessionId`)은 `services/aris-backend/src/runtime/providers/claude/claudeProtocolFields.ts` 에서만 정규화한다.
- `services/aris-backend/src/runtime/providers/claude/claudeProtocolMapper.ts` 와 `services/aris-backend/src/runtime/providers/claude/claudeSessionScanner.ts` 는 이 shared normalization을 사용한다.
- fixture 기반 conformance 테스트는 `services/aris-backend/tests/fixtures/claude/*.jsonl` raw trace를 canonical behavior로 고정한다.
