## 목표

`references/happy`의 Claude 런타임 핵심 기능을 ARIS 백엔드에 단계적으로 흡수해, 현재의 `happyClient.ts` 중심 CLI orchestration 구조를 `Session + launcher + scanner + protocol bridge + provider runtime` 구조로 정렬한다.

## 왜 필요한가

- 현재 ARIS는 Claude 관련 파일 경계는 일부 정리됐지만, Happy의 핵심인 `Session` 중심 설계, local/remote launcher 분리, session-protocol emitting 구조와는 아직 차이가 큼
- `happyClient.ts`가 여전히 너무 크고 provider 경계가 비대칭적임
- Claude session source, scanner, mapper가 Happy보다 단순한 상태라 장기 유지보수 리스크가 남아 있음

## 핵심 범위

1. Claude session owner 도입
2. synthetic session bootstrap 축소
3. watcher + tail + dedupe scanner 고도화
4. session-protocol adapter 도입
5. Claude event bridge와 persisted-message projection 분리
6. local/remote launcher 책임 분리
7. `happyClient.ts` 축소
8. Codex/Gemini provider symmetry 정리

## 단계

### Sprint 1. Target Runtime Contract
- Claude session contract 정의
- provider runtime contract 정의
- session protocol boundary 정의

### Sprint 2. Session Owner 도입
- `ClaudeSession` 또는 동등 객체 추가
- registry/controller를 session owner 기반으로 재편
- synthetic session bootstrap 축소

### Sprint 3. Local Launcher + Scanner Alignment
- SessionStart hook 경로 설계
- scanner를 watcher 기반으로 확장
- multi-session resume stitching 지원

### Sprint 4. Session Protocol Adapter
- protocol envelope 타입 추가
- `claudeProtocolMapper.ts`를 envelope mapper로 재설계
- sidechain/subagent 모델 도입 여부 결정

### Sprint 5. API Bridge와 Persisted Message 분리
- Claude event bridge 추가
- `happyClient.ts`의 Claude persistence 제거
- metadata/usage 반영 경로 분리

### Sprint 6. Remote Path and Ordered Queue
- remote-capable launcher 설계
- ordered outgoing queue 추가
- permission response coupling 정리

### Sprint 7. `happyClient.ts` 해체와 Provider Symmetry
- Codex runtime extraction
- Gemini runtime boundary 보강
- `happyClient.ts` 최종 축소

### Sprint 8. E2E Rollout
- Claude E2E matrix 작성
- staged deploy + smoke test
- legacy compatibility path 제거

## 완료 기준

- Claude가 Happy와 유사한 stateful session runtime 구조를 가짐
- `happyClient.ts`가 provider dispatch + storage bridge 중심으로 축소됨
- scanner, mapper, event bridge가 protocol-first 구조로 동작함
- Claude/Codex/Gemini provider contract가 일관됨

## 참고 문서

- `docs/03-platform/happy-backend-alignment-procedure-plan.md`
- `docs/dev_report/2026-03-12-happy-backend-alignment-check.md`
