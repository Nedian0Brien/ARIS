# Design: useChatTailRestore Hook Extraction (A1)

**Date:** 2026-04-17  
**Scope:** ChatInterface.tsx — scroll/tail-restore 로직 분리 + 두 버그 수정  
**Branch:** codex/fix-chat-tail-precise  
**Worktree:** /home/ubuntu/project/ARIS-fix-chat-tail-precise  

---

## 목표

ChatInterface.tsx (7357줄)에서 tail-restore settle loop 및 관련 스크롤 로직을 `useChatTailRestore.ts` 훅으로 추출한다. 동시에 아래 두 버그를 훅 내부에서 수정한다.

### 해결할 버그

1. **스크롤 정렬 오차** — settle 완료 후 viewport가 마지막 메시지에 픽셀 단위로 딱 맞지 않음.  
   원인: `scrollIntoView({ block: 'end' })` 이후 anchor element와 container 박스모델 간 잔여 오차.

2. **초기 loadOlder 트리거** — 채팅 진입 직후 settle 중에 무한스크롤(loadOlderHistory)이 발동.  
   원인: scroll handler/mobile scroll effect/loadOlderHistory에 `isTailLayoutSettling` 가드 없음.

---

## 신규 파일

### `useChatTailRestore.ts`

위치: `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`

#### 입력 (Input)

```ts
type UseChatTailRestoreInput = {
  activeChatIdResolved: string | null;
  /**
   * eventsForChatId: shouldRestoreTailScrollOnChatEntry 조건 판단에 사용.
   * activeChatIdResolved와 다른 경우(이전 채팅 이벤트가 아직 남아있는 과도기)
   * 복원 시작을 억제한다.
   */
  eventsForChatId: string;
  hasLoadedCurrentChat: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  isMobileLayout: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  latestVisibleEventIdRef: RefObject<string | null>;
};
```

#### 출력 (Output)

```ts
type UseChatTailRestoreOutput = {
  isTailLayoutSettling: boolean;
  /**
   * 클로저(useCallback, event listener) 안에서 사용하는 ref 미러.
   * React state는 클로저 캡처 시점에 stale해지므로,
   * handleStreamScroll·mobile scroll handler 등 scroll 이벤트 핸들러는
   * isTailLayoutSettling 대신 이 ref를 반드시 사용해야 한다.
   */
  isTailLayoutSettlingRef: MutableRefObject<boolean>;
  isInitialChatEntryPendingReveal: boolean;
  shouldStickToBottomRef: MutableRefObject<boolean>;
  /**
   * shouldStickToBottomRef.current 쓰기는 훅 외부(ChatInterface)에서도 발생한다.
   * 훅 내 settle 로직도 이 ref를 읽으므로, 외부 쓰기 사이트들이 settle 창에
   * 이 값을 덮어쓰지 않도록 주의해야 한다.
   *
   * 안전한 외부 쓰기 사이트:
   * - handleJumpToBottom (→ true): settle 완료 후에만 사용자가 클릭 가능
   * - handleComposerFocus (→ true): settle 중 포커스는 드물지만 무해
   * - handleStreamScroll (→ near-bottom 판정): settle 중 scroll은
   *   isTailLayoutSettlingRef 가드로 조기 반환되므로 이 라인에 도달 불가
   *
   * 결론: 모든 외부 쓰기는 settle 창에서 안전하거나 도달 불가.
   * 별도 setter 불필요. 하지만 이 분석을 코드 리뷰 시 명시적으로 확인할 것.
   */
  showScrollToBottom: boolean;
  setShowScrollToBottom: Dispatch<SetStateAction<boolean>>;
  scrollConversationToBottom: (behavior?: ScrollBehavior) => void;
  restoreConversationToTail: (behavior?: ScrollBehavior) => void;
  syncScrollToBottomButton: () => void;
  handleJumpToBottom: () => void;
};
```

#### 내부 소유 State / Ref

| 이름 | 종류 | 현재 위치 |
|---|---|---|
| `restoredTailScrollForChatRef` | ref | ChatInterface L3058 |
| `tailRestoreCancelRef` | ref | ChatInterface L3059 |
| `shouldStickToBottomRef` | ref | ChatInterface L3061 |
| `isTailLayoutSettling` | state | ChatInterface (setIsTailLayoutSettling) |
| `isTailLayoutSettlingRef` | ref | 신규 — state의 ref 미러, 클로저 안에서 stale 방지 |
| `isInitialChatEntryPendingReveal` | state | ChatInterface |
| `showScrollToBottom` | state | ChatInterface |

#### 내부 함수 (훅에서 useCallback)

- `scrollConversationToBottom(behavior?)` — stream 또는 window 스크롤
- `restoreConversationToTail(behavior?)` — anchor scrollIntoView → fallback scrollConversationToBottom
- `readTailLayoutMetrics()` — anchorBottom + scrollHeight 측정
- `syncScrollToBottomButton()` — isNearBottom/isNearWindowBottom → showScrollToBottom 갱신
- `handleJumpToBottom()` — shouldStickToBottom 세트 후 smooth 스크롤

#### 내부 Effects (훅에서 useEffect)

1. **Reset effect** (activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome 의존)  
   workspace/새채팅 전환 시 cancel + state 초기화.

2. **Settle loop effect** (현 ChatInterface 4863~4951)  
   shouldRestoreTailScrollOnChatEntry 조건 통과 시 settle 루프 실행.

---

## 버그 수정 상세

### 버그1 — 픽셀 정밀 정렬

`complete()` 직전(stableFrameCount >= 2 확인 후)에 최종 보정 1회:

```ts
// settle 완료 직전 — anchor 오차 제거
if (isMobileLayout) {
  const scrollHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  window.scrollTo({ top: Math.max(0, scrollHeight - viewportHeight), behavior: 'auto' });
} else {
  const stream = scrollRef.current;
  if (stream) {
    stream.scrollTop = stream.scrollHeight - stream.clientHeight;
  }
}
```

### 버그2 — loadOlder 가드

훅은 `isTailLayoutSettling` 상태를 노출한다. ChatInterface에서 3개 지점에 가드 추가:

```ts
// 1. loadOlderHistory (L4448) — useCallback dependency에 isTailLayoutSettling 포함 가능
if (isLoadingOlder || !hasMoreBefore || isTailLayoutSettling) return;

// 2. mobile window scroll handler (L4833) — 클로저이므로 ref 사용
if (isLoadingOlder || !hasMoreBefore || isTailLayoutSettlingRef.current) return;

// 3. handleStreamScroll (L5911)
// ⚠ React state는 클로저 안에서 stale하므로 isTailLayoutSettling 대신 ref를 사용
if (!isLoadingOlder && hasMoreBefore && !isTailLayoutSettlingRef.current && stream.scrollTop <= 96) {
  void loadOlderHistory();
}
```

---

## ChatInterface.tsx 변경 요약

### 삭제되는 코드 (~280줄)

- L3058–3061: `restoredTailScrollForChatRef`, `tailRestoreCancelRef`, `shouldStickToBottomRef`
- L4527–4605: `scrollConversationToBottom`, `restoreConversationToTail`, `readTailLayoutMetrics`, `syncScrollToBottomButton`, `handleJumpToBottom`
- L4847–4953: reset effect + settle loop effect 2개
- `isTailLayoutSettling`, `isInitialChatEntryPendingReveal`, `showScrollToBottom` state 선언

### 추가되는 코드 (~15줄)

```ts
const {
  isTailLayoutSettling,
  isInitialChatEntryPendingReveal,
  shouldStickToBottomRef,
  showScrollToBottom,
  setShowScrollToBottom,
  scrollConversationToBottom,
  restoreConversationToTail,
  syncScrollToBottomButton,
  handleJumpToBottom,
} = useChatTailRestore({ ... });
```

- `loadOlderHistory`, `handleStreamScroll`, mobile scroll handler에 가드 3곳 추가

---

## 테스트 계획

### 기존 (유지)
- `chatScroll.test.ts` — 헬퍼 단위 테스트
- `chatScrollRestoreAnchor.test.ts` — anchor resolve 단위 테스트

### 신규: `useChatTailRestore.test.tsx`
- settle 완료 후 `isTailLayoutSettling === false`
- settle 중 `isTailLayoutSettling === true` 유지
- settle 완료 시 (desktop) `stream.scrollTop === stream.scrollHeight - stream.clientHeight`
- settle 완료 시 (mobile) `window.scrollTo` 호출 인수 = `{ top: scrollHeight - viewportHeight, behavior: 'auto' }` — `window.visualViewport` mock 필요
- settle 중 `isTailLayoutSettlingRef.current === true` (ref 미러 동기화 검증)
- chat 전환 시 이전 cancel 콜백 호출됨
- workspace/빈 채팅 전환 시 즉시 reset
- settle 중 loadOlderHistory 호출 시 no-op (Bug2 가드 검증)

---

## 코드 규모 예상

| | 줄 수 |
|---|---|
| ChatInterface.tsx 현재 | 7,357 |
| 삭제 (이동) | -280 |
| 가드 추가 | +8 |
| **ChatInterface.tsx 이후** | **~7,085** |
| 신규 useChatTailRestore.ts | ~260 |
| 신규 테스트 파일 | ~150 |

---

## 위험 및 롤백

- `shouldStickToBottomRef`는 composer focus, submit 등 다수 위치에서 읽음 → 훅이 ref 객체를 반환하므로 레퍼런스 동일성 유지됨.
- 롤백: 단일 커밋 revert.
- TypeScript 빌드로 누락된 의존성 조기 감지.
