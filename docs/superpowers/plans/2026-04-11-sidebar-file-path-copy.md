# Sidebar File Path Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 화면 우측 사이드바의 파일 트리와 파일 편집기에서 절대경로 및 워크스페이스 루트 기준 상대경로를 복사할 수 있게 만든다.

**Architecture:** 경로 복사 계산은 전용 helper로 분리해 테스트 가능한 형태로 고정한다. 우측 사이드바 파일 트리 메뉴와 `WorkspaceFileEditor` 헤더는 이 helper를 공유하고, 각 위치에서만 복사 성공/실패 상태를 관리한다.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, browser clipboard API

---

### Task 1: 경로 복사 helper 추가

**Files:**
- Create: `services/aris-web/lib/workspacePathCopy.ts`
- Test: `services/aris-web/tests/workspacePathCopy.test.ts`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

### Task 2: 파일 트리 메뉴에 복사 액션 연결

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`
- Test: `services/aris-web/tests/workspacePathCopy.test.ts`

- [x] **Step 1: Add copy state and clipboard handler for tree items**
- [x] **Step 2: Add absolute/relative copy menu actions**
- [x] **Step 3: Surface lightweight success/failure feedback**
- [x] **Step 4: Re-run targeted tests**
- [x] **Step 5: Commit**

### Task 3: 파일 편집기 헤더에 복사 버튼 추가

**Files:**
- Modify: `services/aris-web/components/files/WorkspaceFileEditor.tsx`
- Modify: `services/aris-web/components/files/WorkspaceFileEditor.module.css`
- Modify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`

- [x] **Step 1: Pass workspace root path into the editor**
- [x] **Step 2: Add absolute/relative copy buttons with transient status**
- [x] **Step 3: Keep layout compact on wrapped header rows**
- [x] **Step 4: Run targeted tests and `./node_modules/.bin/tsc --noEmit`**
- [x] **Step 5: Commit**
