# Codex Default Model Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex 새 채팅이 설정 페이지 기본 모델을 지원하고, 같은 브라우저에서는 마지막 선택 모델을 우선 기억하도록 만든다.

**Architecture:** 모델 선택 우선순위를 전용 helper로 분리해 브라우저 캐시와 설정 기본값을 한곳에서 계산한다. 설정 페이지는 Codex provider의 `defaultModelId`를 저장하고, 채팅 화면은 마지막 선택을 `localStorage`에 기록한 뒤 새 채팅 생성 시 이를 먼저 사용한다.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, localStorage

---

### Task 1: 모델 우선순위 helper 추가

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chatModelPreferences.ts`
- Test: `services/aris-web/tests/chatModelPreferences.test.ts`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

### Task 2: Codex 설정 기본 모델 UI 연결

**Files:**
- Modify: `services/aris-web/app/SettingsTab.tsx`
- Test: `services/aris-web/tests/providerModels.test.ts`

- [x] **Step 1: Extend selection/default expectations**
- [x] **Step 2: Save Codex `defaultModelId` with the selected model list**
- [x] **Step 3: Keep the default model valid when the selection changes**
- [x] **Step 4: Verify with targeted tests and typecheck**
- [x] **Step 5: Commit**

### Task 3: 새 채팅에서 브라우저 캐시 우선 적용

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Test: `services/aris-web/tests/chatComposer.test.ts`

- [x] **Step 1: Wire the helper into new-chat default model resolution**
- [x] **Step 2: Persist last selected Codex model on user model changes**
- [x] **Step 3: Re-run targeted tests**
- [x] **Step 4: Run `./node_modules/.bin/tsc --noEmit`**
- [x] **Step 5: Run `npm run build`**
