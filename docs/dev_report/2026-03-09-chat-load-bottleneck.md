# 채팅 로드 병목 계측 보고서 (2026-03-09)

## 목적
좌측 채팅 목록 전환 및 채팅 페이지 초기 로드가 느린 원인을 구간별로 수치화한다.

## 계측 환경
- 측정 시각: 2026-03-09 (KST)
- 대상 세션: `cmmg7ph5z01flo114kknvf1n7`
- 대상 구간:
  - `GET /v1/sessions`
  - `GET /v1/permissions?state=pending`
  - `GET /v3/sessions/:sessionId/messages?after_seq=0&limit=40`
  - `getSessionEvents(sessionId, { limit: 40 })`
  - `getSessionEvents(sessionId, { limit: 40, chatId })`

## 결과 요약

### 1) 백엔드 API 지연/페이로드
| API | 평균 지연 | 최소 | 최대 | 평균 응답 크기 | 비고 |
|---|---:|---:|---:|---:|---|
| `/v1/sessions` | 93.3ms | 9.8ms | 422.8ms | 1,661B | 세션 8개 |
| `/v1/permissions?state=pending` | 20.0ms | 2.7ms | 80.9ms | 18B | 매우 작음 |
| `/v3/sessions/:id/messages?...` | 1,683.0ms | 1,189.1ms | 2,149.9ms | 15,354,380B | 메시지 약 2,963건 |

### 2) 웹 레이어 함수(`getSessionEvents`) 실측
- `getSessionEvents(sessionId, { limit: 40 })`: **2,889.3ms** (반환 40, 전체 2,983)
- 비교 측정:
  - 전체: 2,070.5ms (전체 2,984)
  - `chatId` 필터 적용: 1,460.2ms (해당 chat 421)

`chatId` 필터를 넣어도 1.4초대가 유지되어, 필터 이전 단계(메시지 전체 조회/전송) 비용이 지배적임.

### 3) 파싱/필터링 비용 분리
동일 세션 payload(약 15.37MB, 메시지 2,971건) 기준:
- 네트워크 수신: 1,471.8ms
- JSON.parse: 평균 60.6ms
- chatId 필터: 1.5ms
- 정렬: 20.1ms

결론적으로 CPU 파싱/필터링보다 네트워크 전송 + 백엔드 조회가 절대 병목이다.

## 원인 분석

### A. 웹의 이벤트 조회가 전체 메시지를 전제로 동작
- 파일: `services/aris-web/lib/happy/client.ts`
- 함수: `getSessionEvents`
- 현 상태: 최신 40개를 보여주기 위해서도 내부적으로 전체 메시지 로드를 수행한 뒤, 클라이언트 측에서 정규화/필터/페이지네이션.

### B. 백엔드 메시지 API가 페이지네이션 쿼리를 사실상 반영하지 않음
- 파일: `services/aris-backend/src/server.ts`
- 라우트: `GET /v3/sessions/:sessionId/messages`
- 현 상태: 쿼리(`after_seq`, `limit`)를 읽지 않고 `store.listMessages(sessionId)` 전체 반환.

### C. Happy store 레이어도 `listMessages`가 전체 메시지 경로
- 파일: `services/aris-backend/src/runtime/happyClient.ts`
- 함수: `listMessages` → `listAllMessages`
- 현 상태: 결국 세션 전체 메시지를 수집 후 반환.

## 결론
체감 지연의 주 원인은 **“필요한 40개를 위해 전체 메시지(수천 건/수십 MB)를 매번 가져오는 경로”**이다.
페이지 컴포넌트를 쪼개는 것만으로는 근본 해결이 어렵고, 메시지 API/조회 전략 자체를 페이지네이션 중심으로 바꿔야 한다.

## 수정 후 재측정 (동일 세션, 수정본 백엔드 4180 포트)

### 적용된 변경
- `aris-backend`
  - `GET /v3/sessions/:sessionId/messages`에서 `after_seq`, `limit`를 실제 반영
  - 페이지 응답에 `hasMore`, `lastSeq` 포함
  - `RuntimeStore.listMessages` 시그니처 확장(페이지네이션)
  - Happy 클라이언트에서 큰 `limit` 요청 시 내부 다중 페이지 조회로 분할 처리
- `aris-web`
  - `getSessionEvents`를 최신 구간 우선 조회(윈도우 스캔) + 필요 시 fallback 방식으로 변경
  - 메시지 seq 파싱을 `meta.seq`까지 인식

### 재측정 결과
- `/v3/sessions/:id/messages?after_seq=0&limit=40`
  - **변경 전**: 평균 1,683ms / 15.3MB / 약 2,963건
  - **변경 후**: 약 94ms / 236KB / 40건
- `getSessionEvents(limit=40)` (all)
  - **변경 전**: 2.0~2.9s
  - **변경 후**: 약 613ms
- `getSessionEvents(limit=40, chatId=...)`
  - **변경 전**: 약 1.46~2.37s
  - **변경 후**: 약 1.88s (희소 chat의 경우 스캔 범위에 따라 편차 존재)

### 해석
- 가장 큰 병목이던 “대용량 전체 메시지 전송”은 해소됨.
- chatId가 오래된 히스토리를 많이 참조하는 경우는 추가 최적화 여지가 남아 있음(윈도우 스캔 전략 튜닝 필요).

## 권장 개선 우선순위
1. `/v3/sessions/:sessionId/messages`에서 `after_seq`, `limit`을 실제로 반영하도록 백엔드 라우트/스토어 시그니처 확장
2. `getSessionEvents`를 "전체 로드 후 잘라내기"에서 "필요 페이지 직접 조회" 방식으로 전환
3. chatId 필터를 서버단에서 선적용하는 경량 이벤트 조회 API 추가(또는 기존 API 확장)
4. 초기 렌더는 20개 이하 + 나머지는 점진 로드로 TTFB/체감 개선
5. 계측 지표(응답 크기/지연/메시지 건수)를 지속 수집해 회귀 방지
