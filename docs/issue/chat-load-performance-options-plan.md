# Plan: Chat Load Performance Options

**Generated**: 2026-03-14
**Estimated Complexity**: High

## Overview
채팅 화면의 느린 새로고침/진입 문제는 단일 병목이 아니라 세 가지 비용이 겹친 결과다.

- 서버 컴포넌트 재실행 비용: `services/aris-web/app/sessions/[sessionId]/page.tsx`
- 클라이언트 초기 동기화 폭주: `useSessionEvents`, `useSessionRuntime`, `usePermissions`, sidebar snapshot polling
- 타임라인 재계산/재렌더 비용: `visibleEvents -> buildStreamRenderItems -> timelineItems`

이번 계획의 목적은 가능한 해결책을 여러 축으로 분리하고, 어떤 순서와 조합으로 도입할지 결정할 수 있게 만드는 것이다.

## Assumptions
- 목표는 “첫 화면 체감 속도” 개선이 우선이다.
- 기능 회귀 없이 단계적으로 도입해야 한다.
- 현재 구조를 한 번에 전면 교체하는 것보다, 측정 가능한 단계별 개선이 더 적합하다.

## Option Set

### Option A: 서버 네비게이션 비용 축소
**핵심 아이디어**: 채팅 전환 시 서버 컴포넌트 재실행 의존도를 낮추고, 클라이언트 상태를 우선 사용한다.

**대상**
- `services/aris-web/app/sessions/[sessionId]/page.tsx`
- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

**장점**
- 채팅 전환 체감 속도 개선 폭이 가장 크다.
- URL 반영은 유지하면서도, 즉시 화면 전환이 가능하다.
- 서버 fetch 묶음을 매번 다시 기다리지 않아도 된다.

**단점**
- 상태 일관성 설계가 필요하다.
- 새로고침 시 SSR과 client state의 경계가 복잡해진다.

**리스크**
- active chat, initial events, sidebar snapshot 간 동기화 버그
- 뒤로가기/앞으로가기 시 상태 불일치

**도입 난이도**
- 높음

**기대 효과**
- 채팅 전환 속도: 매우 큼
- 새로고침 속도: 중간

### Option B: 초기 polling fan-out 줄이기
**핵심 아이디어**: 첫 렌더 직후 동시에 시작하는 동기화를 늦추거나 조건부로 실행한다.

**대상**
- `services/aris-web/lib/hooks/useSessionEvents.ts`
- `services/aris-web/lib/hooks/useSessionRuntime.ts`
- `services/aris-web/lib/hooks/usePermissions.ts`
- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

**장점**
- 구현 비용 대비 체감 개선 가능성이 높다.
- 초기 CPU/네트워크 burst를 바로 줄일 수 있다.
- 구조를 크게 바꾸지 않는다.

**단점**
- 일부 보조 정보(runtime badge, sidebar snapshot, permissions)가 약간 늦게 보일 수 있다.

**리스크**
- 로딩 상태 관리가 부정확하면 “깜빡임”이 생길 수 있다.

**도입 난이도**
- 낮음~중간

**기대 효과**
- 채팅 진입/새로고침: 큼
- 채팅 전환: 중간

### Option C: sidebar snapshot API 경량화
**핵심 아이디어**: sidebar 상태를 얻기 위해 chat별 runtime/event 조회를 반복하지 않도록 바꾼다.

**대상**
- `services/aris-web/app/api/runtime/sessions/[sessionId]/chats/sidebar/route.ts`
- `services/aris-web/lib/happy/client.ts`
- `services/aris-web/lib/happy/chats.ts`

**장점**
- 채팅이 많을수록 효과가 커진다.
- 서버 부하와 지연을 함께 줄인다.
- snapshot 데이터를 더 캐시 친화적으로 만들 수 있다.

**단점**
- snapshot source of truth를 정리해야 한다.
- 최신성 vs 비용 trade-off를 결정해야 한다.

**리스크**
- sidebar preview가 실제 최신 이벤트보다 늦게 보일 수 있다.

**도입 난이도**
- 중간

**기대 효과**
- 사이드바 많은 세션: 매우 큼
- 단일 채팅 진입: 중간

### Option D: 타임라인 렌더 비용 최적화
**핵심 아이디어**: 이벤트 수가 많아질수록 비싸지는 파생 계산과 DOM 렌더를 줄인다.

**대상**
- `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- 필요 시 메시지/액션 카드 컴포넌트 분리

**장점**
- 긴 transcript에서 스크롤/입력 지연을 줄일 수 있다.
- 스트리밍 중에도 프레임 드랍을 줄일 수 있다.

**단점**
- 잘못 건드리면 렌더링 버그가 생긴다.
- virtualization 도입 시 스크롤 보정 로직이 복잡해진다.

**리스크**
- auto-scroll, load older, highlight, permission jump와 충돌

**도입 난이도**
- 중간~높음

**기대 효과**
- 긴 채팅: 매우 큼
- 짧은 채팅 초기 로드: 중간

### Option E: 이벤트/스냅샷 데이터 모델 재설계
**핵심 아이디어**: active chat timeline과 sidebar snapshot을 같은 이벤트 스트림에서 파생하지 말고, 별도 최적화된 read model로 분리한다.

**대상**
- web snapshot 모델
- backend/web API 계약

**장점**
- 장기적으로 가장 안정적이다.
- 성능과 일관성을 함께 잡기 좋다.

**단점**
- 범위가 크다.
- 단기 해결책으로는 무겁다.

**리스크**
- 설계/이관 비용이 크고, 지금 문제에 비해 과투자일 수 있다.

**도입 난이도**
- 매우 높음

**기대 효과**
- 장기적: 매우 큼
- 단기적: 낮음

## Recommended Decision

### 권장 조합: B + C 먼저, 이후 D
이 조합이 가장 현실적이다.

- B는 초기 체감 속도를 빠르게 개선할 수 있다.
- C는 채팅 수가 많아질수록 누적되는 서버 비용을 줄인다.
- D는 긴 transcript에서 남는 버벅임을 해결하는 2차 대응이다.

Option A는 효과는 크지만 상태 복잡도를 급격히 올린다. 지금 단계에서 바로 A로 가면, 속도 문제를 줄이는 대신 채팅 상태 일관성 버그를 새로 만들 가능성이 높다.

Option E는 장기 방향으로는 맞지만, 당장 선택할 카드가 아니다.

## Suggested Rollout

## Sprint 1: 초기 burst 줄이기
**Goal**: 첫 렌더 직후 동시 polling을 줄여 체감 속도를 개선한다.
**Demo/Validation**:
- 새로고침 시 첫 메시지 렌더까지 시간을 비교
- DevTools network waterfall에서 초기 요청 수 감소 확인

### Task 1.1: 비핵심 polling 지연 시작
- **Location**: `services/aris-web/lib/hooks/useSessionRuntime.ts`, `services/aris-web/lib/hooks/usePermissions.ts`, `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- **Description**: active timeline 표시에 필수적이지 않은 polling은 첫 paint 이후 짧은 지연 또는 idle 시점에 시작
- **Acceptance Criteria**:
  - 첫 렌더 직후 동시 요청 수 감소
  - runtime/permissions/sidebar가 약간 늦게 와도 UI 오류 없음

### Task 1.2: sidebar snapshot 초기 fetch 범위 축소
- **Location**: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- **Description**: 초기에는 active chat + 화면에 보이는 최소 수만 요청하고, 나머지는 지연 fetch
- **Acceptance Criteria**:
  - 초기 sidebar API payload 감소
  - active chat 정보는 유지

## Sprint 2: sidebar API 경량화
**Goal**: per-chat runtime/event fan-out 비용을 줄인다.
**Demo/Validation**:
- sidebar route 응답 시간 및 내부 fetch 횟수 비교

### Task 2.1: cached snapshot 우선 반환
- **Location**: `services/aris-web/app/api/runtime/sessions/[sessionId]/chats/sidebar/route.ts`
- **Description**: 최신 이벤트가 캐시돼 있으면 runtime만 최소 조회하거나, 필요한 chat만 조회
- **Acceptance Criteria**:
  - cached chat에 대해 unnecessary latest-event scan 감소

### Task 2.2: runtime 상태 조회 배치 전략 검토
- **Location**: `services/aris-web/app/api/runtime/sessions/[sessionId]/chats/sidebar/route.ts`, `services/aris-web/lib/happy/client.ts`
- **Description**: chat별 runtime 조회를 줄이거나 session 범위 snapshot으로 대체 가능한지 검토
- **Acceptance Criteria**:
  - target chat 수 증가 시 응답 시간 증가폭 완화

## Sprint 3: 타임라인 렌더 최적화
**Goal**: 이벤트 수가 많아도 스크롤/입력/스트리밍이 부드럽게 유지되도록 한다.
**Demo/Validation**:
- 긴 transcript에서 React Profiler commit time 감소

### Task 3.1: 파생 계산 비용 계측
- **Location**: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- **Description**: `visibleEvents`, `streamItems`, `timelineItems` 계산 시간을 profiler로 측정
- **Acceptance Criteria**:
  - 어떤 파생 단계가 가장 비싼지 수치화

### Task 3.2: 메시지 렌더 단위 분리
- **Location**: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- **Description**: 이벤트 카드 단위 memoization 또는 컴포넌트 분리
- **Acceptance Criteria**:
  - partial 업데이트 시 전체 타임라인 재렌더 감소

### Task 3.3: virtualization 여부 결정
- **Location**: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- **Description**: transcript 길이 임계치 기준 virtualization 필요 여부 판단
- **Acceptance Criteria**:
  - 도입 여부를 수치 기반으로 결정

## Decision Matrix

| Option | 효과 | 구현비용 | 리스크 | 권장도 |
| --- | --- | --- | --- | --- |
| A. 서버 네비게이션 축소 | 매우 큼 | 높음 | 높음 | 보류 |
| B. 초기 polling fan-out 축소 | 큼 | 낮음~중간 | 낮음 | 즉시 |
| C. sidebar API 경량화 | 큼 | 중간 | 중간 | 즉시 |
| D. 타임라인 렌더 최적화 | 중간~매우 큼 | 중간~높음 | 중간 | 2순위 |
| E. 데이터 모델 재설계 | 장기적으로 매우 큼 | 매우 높음 | 높음 | 장기 |

## Recommended Decision Rules
- “이번 주 안에 체감 속도 개선”이 목표면: **B + C**
- “긴 채팅까지 확실히 부드럽게”가 목표면: **B + C 후 D**
- “구조를 크게 바꿔도 된다”면: **A는 별도 설계 문서 후 재평가**
- “근본 재설계”는 지금이 아니라, B/C/D 이후에도 불충분할 때만 E 검토

## Testing Strategy
- 새로고침에서 첫 메시지 렌더 시간 측정
- chat switch에서 URL 변경 후 usable UI까지 시간 측정
- 긴 transcript에서 input latency 및 scroll jank 측정
- sidebar chat 1개 / 10개 / 30개 시나리오 비교

## Potential Risks & Gotchas
- runtime badge나 sidebar 최신 상태가 늦게 보이면 사용자 혼란 가능
- virtualization 도입 시 auto-scroll/load older가 깨질 수 있음
- client cache 강화 시 browser history와 충돌 가능

## Rollback Plan
- polling 지연과 sidebar API 경량화는 feature flag 또는 작은 PR 단위로 도입
- timeline optimization은 단계별 커밋으로 분리
- 체감 개선이 없으면 B/C만 유지하고 A/E는 보류
