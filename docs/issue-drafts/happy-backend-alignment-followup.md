## 배경

- 현재 ARIS는 Claude provider subtree를 도입해 Happy 방향으로 상당 부분 정렬되었음
- 다만 아직 Happy식 stateful session runtime과 완전히 일치하지는 않음

## 남은 핵심 차이

1. `happyClient.ts`가 여전히 너무 큼
2. Claude session source가 synthetic `--session-id` bootstrap에 크게 의존함
3. `claudeSessionScanner.ts`가 live tail / dedupe / ordered delivery 수준까지는 아님
4. `claudeProtocolMapper.ts`가 full session protocol mapper 수준은 아님
5. local / remote launcher 분리가 없음
6. Codex / Gemini provider boundary가 Claude만큼 정리되지 않음

## 목표

- `happyClient.ts`를 provider dispatch + storage bridge 중심으로 축소
- Claude session source를 observed/provider source 중심으로 전환
- scanner를 canonical event source에 가깝게 확장
- mapper를 turn/tool lifecycle 중심으로 강화
- Codex / Gemini까지 provider architecture 일관성 확보

## 우선순위 제안

1. Claude session source 정렬
2. Claude scanner 고도화
3. Claude protocol mapper 확장
4. `happyClient.ts` 추가 축소
5. Codex / Gemini 경계 정리

## 참고

- 분석 문서: `docs/dev_report/2026-03-12-happy-backend-alignment-check.md`
