# Design: Chat History Windowing and Latest-Page Jump

**Date:** 2026-04-19  
**Scope:** `useSessionEvents`, `useChatTailRestore`, `ChatInterface`  
**Branch:** `codex/chat-page-windowing-0419-204151`  
**Worktree:** `/home/ubuntu/project/ARIS/.worktrees/codex/chat-page-windowing-0419-204151`

---

## Goal

긴 채팅에서 오래된 상단 페이지가 계속 DOM과 메모리에 남아 성능이 저하되는 문제를 완화한다. 동시에 채팅 화면의 `맨 아래로 이동` 버튼 의미를 단순 스크롤 이동에서 `최신 페이지 윈도우를 다시 로드한 뒤 tail 위치로 복귀`로 재정의한다.

---

## Current Behavior

- `useSessionEvents` 는 최신 1페이지를 hydrate 한 뒤, `loadOlder()` 호출 시 `before=<oldestId>` 기준으로 과거 페이지를 앞에 계속 prepend 한다.
- 이미 로드한 오래된 페이지를 해제하는 로직이 없어, 긴 세션에서는 `events` 배열과 DOM 길이가 계속 증가한다.
- `handleJumpToBottom()` 은 `scrollConversationToBottom('smooth')` 만 호출하므로, 과거 페이지를 많이 본 상태에서도 메모리 윈도우를 최신 상태로 되돌리지 못한다.

---

## Chosen Approach

`최근 N페이지 유지 + 최신 페이지 복귀 액션` 을 도입한다.

### Why this approach

1. 기존 `before` 기반 페이지네이션을 유지해 리스크를 낮출 수 있다.
2. 현재 문제인 `상단 과거 페이지 누적` 을 직접 해결한다.
3. 가상 스크롤보다 구현 범위가 작고, 현재의 스트리밍/permission/tail-restore 흐름을 크게 흔들지 않는다.

---

## Design Summary

### 1. `useSessionEvents` 에 page-window state 추가

`events` 만 관리하던 현재 구조를, "지금 메모리에 유지 중인 연속 페이지 윈도우" 를 추적할 수 있게 확장한다.

추가 개념:

- `EVENTS_PAGE_LIMIT` 기준 페이지 단위 유지
- `MAX_LOADED_EVENT_PAGES` 상수 도입
- 현재 메모리 윈도우에 포함된 페이지 수 추적
- trim 이후에도 다시 위로 올라갈 수 있도록 `hasMoreBefore` 와 oldest cursor는 유지
- 최신 페이지로 되돌리는 `resetToLatestWindow()` 액션 추가

`resetToLatestWindow()` 는 현재 채팅 기준으로 최신 1페이지를 다시 fetch 하고, `events` 를 그 결과로 치환한다. 이때 `hasMoreBefore` 는 서버 page metadata 로 다시 계산한다.

### 2. 오래된 상단 페이지 trim

`loadOlder()` 성공 후 메모리 윈도우가 `MAX_LOADED_EVENT_PAGES` 를 초과하면, 가장 오래된 페이지 단위(앞쪽 `EVENTS_PAGE_LIMIT` 개)로 잘라낸다.

원칙:

- trim 대상은 항상 가장 오래된 페이지부터 제거한다.
- 현재 윈도우는 항상 "연속된 최근 페이지들" 이어야 한다.
- 실시간 append 는 최신 쪽에만 붙고, trim된 구간을 자동 복원하지 않는다.

### 3. `맨 아래로 이동` 버튼 의미 변경

`useChatTailRestore.handleJumpToBottom()` 은 더 이상 단순 scroll helper가 아니다.

새 동작:

1. `shouldStickToBottomRef.current = true`
2. `showScrollToBottom = false`
3. `resetToLatestWindow()` 호출
4. 최신 페이지 렌더 완료 후 `restoreConversationToTail('smooth')`

이로써 사용자가 오래된 과거 페이지를 여러 개 펼친 뒤 버튼을 눌러도, 화면은 최신 1페이지 윈도우와 tail 위치로 정리된다.

### 4. 기존 loadOlder / scroll guard 유지

기존의 `loadOlderHistory()` 와 `isTailLayoutSettling` 가드는 유지한다.  
이번 변경은 "무한스크롤 트리거 조건" 이 아니라 "로드 후 메모리 윈도우 관리" 와 "하단 버튼 의미" 를 바꾸는 쪽에 집중한다.

---

## API / Hook Changes

### `useSessionEvents` 반환값 추가

```ts
{
  events,
  eventsForChatId,
  addEvent,
  syncError,
  loadOlder,
  hasMoreBefore,
  isLoadingOlder,
  hasLoadedCurrentChat,
  resetToLatestWindow,
  isResettingToLatest,
}
```

### `useChatTailRestore` 입력 추가

```ts
type UseChatTailRestoreInput = {
  ...
  resetToLatestWindow: () => Promise<void>;
};
```

`handleJumpToBottom()` 은 async action 이 되며, reset 완료 후 tail restore 를 수행한다.

---

## File Changes

### Modify: `services/aris-web/lib/hooks/useSessionEvents.ts`

- page window bookkeeping 추가
- trim helper 추가
- 최신 페이지 재동기화 함수 `resetToLatestWindow()` 추가
- chat 전환 시 관련 state reset

### Modify: `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`

- `resetToLatestWindow()` 주입
- `handleJumpToBottom()` 을 async latest-page reset flow로 변경

### Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

- `useSessionEvents()` 에서 새 액션/상태 수신
- `useChatTailRestore()` 에 reset action 전달
- 버튼 disabled/loading 처리 필요 시 연결

### Add/Modify Tests

- `services/aris-web/tests/useSessionEvents.test.tsx` 또는 기존 hook 테스트 파일
- `services/aris-web/tests/chatTailRestore.test.tsx` 계열
- 필요 시 `ChatInterface` UI 테스트

---

## Testing Strategy

### Hook tests

1. 초기 최신 페이지 로드 상태에서 `loadOlder()` 여러 번 호출
2. `MAX_LOADED_EVENT_PAGES + 1` 페이지가 되면 가장 오래된 페이지가 제거되는지 확인
3. trim 이후에도 `hasMoreBefore` 가 유지되어 다시 `loadOlder()` 가능한지 확인
4. `resetToLatestWindow()` 호출 시 최신 1페이지로 치환되는지 확인

### Tail / jump behavior

1. 과거 페이지를 여러 개 로드한 상태에서 `handleJumpToBottom()` 호출
2. `resetToLatestWindow()` 가 먼저 호출되는지 확인
3. 이후 tail restore 가 실행되는지 확인

### Regression

- 기존 `loadOlderHistory()` 스크롤 보정이 깨지지 않는지 확인
- 모바일 overflow 관련 회귀 테스트 실행

---

## Risks and Guards

### Risk: trim 시 스크롤 위치가 튀는 문제

이번 단계에서는 trim 을 `loadOlder()` 완료 직후에만 수행하고, 사용자가 위로 보는 동안 앞쪽이 잘리더라도 "현재 보이는 연속 윈도우" 범위를 유지하도록 한다. 필요하면 후속 작업에서 trim 직전/직후 스크롤 오프셋 보정 로직을 추가한다.

### Risk: 최신 페이지 reset 중 실시간 이벤트 경쟁

`resetToLatestWindow()` 는 현재 active chat snapshot guard 를 사용해, 채팅 전환 중 stale response 가 상태를 덮지 못하게 한다.

### Risk: 하단 버튼 클릭 중 연속 클릭

`isResettingToLatest` 로 중복 reset 호출을 방지한다.

---

## Out of Scope

- 가상 스크롤 도입
- 메시지 단위 viewport virtualization
- 서버 페이지 크기 변경
- 기존 permission/timeline grouping 규칙 변경
