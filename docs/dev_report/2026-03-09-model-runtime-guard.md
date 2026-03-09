# 모델 정합성/장기 실행 가드 적용 보고서 (2026-03-09)

## 적용 목적
- `SessionChat.model='gpt-5-codex'` 잔존 데이터 정리
- 메시지 실행 직전 모델 유효성 검증 강화
- Codex turn 장기 대기 가드 및 stale running 정리
- 런타임 로그에 `sessionId/chatId/model/turn status` 추적성 강화

## DB 교정(SQL 실행 결과)
실행 시각: 2026-03-09 (KST)

- 교정 전 legacy count: 7
- 교정 SQL:
  - `UPDATE "SessionChat" SET model = NULL WHERE model IS NOT NULL AND btrim(model) = '';`
  - `UPDATE "SessionChat" SET model = 'gpt-5.3-codex' WHERE lower(btrim(coalesce(model, ''))) = 'gpt-5-codex';`
- 교정 후 legacy count: 0
- 참고: `gpt-5.3-codex` 보유 레코드 12건

## 코드 변경 요약
1. 웹 이벤트 POST 직전 모델 검증
- 파일: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`
- 사용자 custom model(DB 저장값) + agent별 허용 목록으로 모델 정규화
- 불일치 모델은 fallback 적용 후 `meta.modelValidation` 기록

2. 모델 정책 유틸 추가
- 파일: `services/aris-web/lib/happy/modelPolicy.ts`
- 파일: `services/aris-backend/src/runtime/modelPolicy.ts`
- legacy alias(`gpt-5-codex -> gpt-5.3-codex`) 및 허용 정책 캡슐화

3. 백엔드 실행 직전 모델 최종 방어
- 파일: `services/aris-backend/src/runtime/happyClient.ts`
- `generateAndPersistAgentReply`에서 agent별 모델 선택/검증 적용

4. Codex turn 타임아웃/장기 running 정리
- 파일: `services/aris-backend/src/runtime/happyClient.ts`
- `CODEX_TURN_TIMEOUT_MS` 기본 30분
- `HAPPY_STALE_RUN_TIMEOUT_MS` 기본 45분
- stale run 탐지 시 abort + 사용자 메시지(`Runtime Guard`)로 정리 사실 기록

5. 런타임 로그 추적 필드 강화
- 파일: `services/aris-backend/src/runtime/happyEventLogger.ts`
- `model`, `turnStatus`, `run_status/turn_status` stage 추가

6. 재유입 방지 정규화
- 파일: `services/aris-web/lib/happy/chats.ts`
- 파일: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- 파일: `services/aris-web/app/api/settings/models/route.ts`
- legacy 모델 ID 저장/사용 경로 정규화

## 검증 결과
- `aris-backend`: `npm run build` 통과
- `aris-backend`: `npm run test` 통과 (23 tests)
- `aris-web`: 전체 타입체크는 기존 Prisma 타입 생성/기존 파일 이슈로 실패(기존 오류), 변경 파일 필터 기준 신규 오류 없음
