# Design: Session Scroll Orchestrator + Chat Resume Hotfix

**Date:** 2026-04-20  
**Scope:** `services/aris-web` session screen scroll pipeline  
**Branch:** `investigate/scroll-regression`  
**Worktree:** `/home/ubuntu/project/ARIS/.worktrees/investigate-scroll-regression`

---

## Goal

모바일에서 채팅 화면 진입, 탭 전환, 앱 백그라운드 복귀, viewport reflow 이후에도
채팅 스크롤이 요동치거나 `loadOlderHistory()`가 잘못 발동하지 않도록 한다.

핫픽스는 즉시 배포 가능한 최소 변경으로 현재 재현 경로를 끊고,
뒤이어 세션 화면 전체에 공통 `scroll phase` 계층을 도입해
"누가 지금 스크롤을 소유하는가"를 단일 판단점으로 통합한다.

## Current Problem

현재 세션 화면에는 스크롤 관련 판단이 분산돼 있다.

- `useChatTailRestore` settle loop가 chat entry 시 tail 정렬을 반복한다.
- `ChatInterface`의 mobile/window scroll handler가 `scrollTop <= 96`이면 `loadOlderHistory()`를 호출한다.
- 일반 auto-scroll / chat-change reset이 별도의 effect에서 다시 하단 정렬을 시도한다.
- `Header` / `BottomNav`는 `window.scroll`, `visualViewport`, `focus`, `pageshow`, `visibilitychange`를 보고 auto-hide 상태를 바꾼다.
- `ViewportHeightSync`와 기타 viewport listener가 문서 높이와 CSS offset을 재계산한다.

문제는 이 흐름들이 "현재 phase"를 공유하지 않는다는 점이다.
그래서 resume/reflow 시점의 시스템성 스크롤 이벤트를
다른 로직이 사용자 의도 스크롤로 오인해 서로 다른 복구/히스토리 로드/auto-hide를 동시에 발동시킨다.

## Phase 1: Deployable Hotfix

### Intent

현재 운영 문제를 빠르게 끊는다.
핫픽스는 resume 직후의 시스템 이벤트를 사용자 스크롤과 분리하는 데 집중한다.

### Design

- 채팅 화면에 `resume guard` 상태를 도입한다.
- guard는 `focus`, `pageshow`, `visibilitychange(visible)`, 필요 시 `visualViewport` resume-reflow 시점에 활성화된다.
- guard 활성 중에는 아래 동작을 차단한다.
  - mobile `window.scroll <= 96` 기반 `loadOlderHistory()`
  - stream scroll 기반 `loadOlderHistory()`
  - 사용자 스크롤로 해석되는 auto-hide/near-bottom 갱신
- guard는 단순 timeout이 아니라 "resume 기준 scroll baseline 재동기화 + 최소 안정 구간" 개념으로 구현한다.
- 핫픽스 단계에서는 `ChatInterface`와 관련 pure helper/test에 국한해 반영한다.

### Acceptance

- 모바일 탭 전환 후 채팅으로 복귀해도 `loadOlderHistory()`가 resume 직후 자동 발동하지 않는다.
- 채팅 화면이 위아래로 왕복하지 않는다.
- 기존 chat entry tail restore와 scroll-to-bottom 동작은 유지된다.

## Phase 2: Session Scroll Orchestrator

### Intent

재발 방지를 위해 세션 화면 전체의 스크롤 판단을 공통 phase 기반으로 통합한다.

### Core Model

세션 화면이 다음 phase 중 하나를 갖는다.

- `idle`
- `user-scrolling`
- `restoring-tail`
- `loading-older`
- `resuming`
- `viewport-reflow`

모든 스크롤 관련 리스너는 직접 행동하지 않고 먼저 phase를 조회한다.
이 계층은 "현재 어떤 이벤트가 왔나"보다 "현재 어떤 행동이 허용되나"를 정의한다.

### Ownership Rules

- `restoring-tail`: tail restore만 스크롤 소유권을 가진다.
- `loading-older`: anchor preservation만 허용되고 auto-scroll은 금지된다.
- `resuming`: stale `scrollY` / `visualViewport` 변화는 사용자 스크롤로 해석하지 않는다.
- `viewport-reflow`: CSS variable, viewport offset, dock metric 재계산은 허용하지만 loadOlder나 auto-hide 전이는 금지한다.
- `user-scrolling`: 이때만 header/bottom-nav auto-hide와 near-bottom 판단이 반응한다.

### Integration Targets

- `ChatInterface.tsx`
- `useChatTailRestore.ts`
- `chatScroll.ts`
- `Header.tsx`
- `BottomNav.tsx`
- `ViewportHeightSync.tsx`

핫픽스는 orchestrator의 축소판을 채팅 내부에 먼저 도입하고,
2단계에서 그 책임을 세션 화면 공용 계층으로 끌어올린다.

## Testing Strategy

### Hotfix

- resume guard pure helper/unit test 추가
- `ChatInterface`의 resume 후 `loadOlderHistory()` 차단 회귀 테스트 추가
- 기존 scroll/tail restore/mobile overflow 테스트 재실행

### Orchestrator

- phase 전이 pure test 추가
- chat entry, tab switch, background resume, viewport reflow, older history load 시나리오 테스트 추가
- header/bottom-nav auto-hide가 `user-scrolling` phase에서만 반응하는지 검증

## Risks

- iOS Safari의 `visualViewport` 이벤트 순서는 환경마다 다를 수 있다.
- 지나치게 긴 guard는 정상 스크롤이나 older-history loading을 지연시킬 수 있다.
- phase 계층을 도입하더라도 기존 direct scroll write가 남아 있으면 재발 가능성이 남는다.

## Decision

배포 전략은 두 단계다.

1. 채팅 resume 경로를 막는 핫픽스를 먼저 배포한다.
2. 이어서 세션 화면 전체 `Scroll Orchestrator` 구조 개편을 완료한다.
