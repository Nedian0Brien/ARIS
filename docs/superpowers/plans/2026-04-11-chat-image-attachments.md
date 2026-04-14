# Chat Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 composer의 `+` 버튼으로 이미지를 업로드하고, 서버 자산 경로를 포함한 첨부 메타를 에이전트에게 전달하며, composer와 사용자 채팅 버블 모두에서 첨부 이미지를 정돈된 UI로 표시한다.

**Architecture:** 업로드와 메시지 전송은 분리한다. 이미지는 전용 업로드 API로 먼저 저장하고, 성공 시 반환된 첨부 메타를 composer 상태와 메시지 `meta.attachments`에 담아 재사용한다. 프롬프트 문자열에는 이미지 참조 블록만 추가하고, UI 렌더링은 문자열 파싱이 아니라 `attachments` 메타 전용 helper를 통해 처리한다.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node `fs/promises`, Vitest

---

## File Map

- Create: `services/aris-web/lib/chatImageAttachments.ts`
  이미지 첨부 타입, 프롬프트 prefix 생성, 이벤트 메타에서 첨부를 안전하게 읽는 helper를 둔다.
- Create: `services/aris-web/tests/chatImageAttachments.test.ts`
  첨부 helper의 입력 정규화, 프롬프트 prefix, meta 파싱을 검증한다.
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/assets/images/route.ts`
  multipart 이미지 업로드를 받아 저장하고 첨부 메타를 반환한다.
- Create: `services/aris-web/tests/chatImageUploadRoute.test.ts`
  업로드 route의 인증, 이미지 타입 검증, 성공 payload를 검증한다.
- Create: `services/aris-web/tests/sessionEventsRoute.test.ts`
  사용자 메시지 전송 시 `meta.attachments`가 보존되는지 검증한다.
- Modify: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`
  `meta.attachments`를 허용하고 기존 모델 보정 로직과 함께 유지한다.
- Modify: `services/aris-web/app/sessions/[sessionId]/chatComposer.ts`
  optimistic user event에 첨부 메타를 포함할 수 있게 확장한다.
- Modify: `services/aris-web/tests/chatComposer.test.ts`
  optimistic event가 첨부 메타를 유지하는지 검증한다.
- Modify: `services/aris-web/lib/happy/types.ts`
  `UiEvent.meta.attachments`가 기대하는 구조를 공유 타입으로 선언한다.
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
  composer 업로드 UI, 첨부 제거, 전송 prefix 생성, 사용자 버블 첨부 프리뷰 렌더링을 연결한다.
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
  composer 첨부 카드와 버블 상단 프리뷰 strip 스타일을 추가한다.

### Task 1: 이미지 첨부 helper와 공유 타입 추가

**Files:**
- Create: `services/aris-web/lib/chatImageAttachments.ts`
- Modify: `services/aris-web/lib/happy/types.ts`
- Test: `services/aris-web/tests/chatImageAttachments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildImageAttachmentPromptPrefix,
  readChatImageAttachments,
} from '@/lib/chatImageAttachments';

describe('chatImageAttachments helpers', () => {
  it('builds an image prompt prefix with serverPath references in input order', () => {
    expect(buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/aris/session-1/chat-1/asset-1-screen.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
    ])).toContain('serverPath="/tmp/aris/session-1/chat-1/asset-1-screen.png"');
  });

  it('returns only valid image attachments from arbitrary meta payloads', () => {
    expect(readChatImageAttachments({
      attachments: [
        { assetId: 'asset-1', kind: 'image', name: 'screen.png', mimeType: 'image/png', size: 1200, serverPath: '/tmp/a.png', previewUrl: '/api/x' },
        { kind: 'file' },
      ],
    })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageAttachments.test.ts`
Expected: FAIL because `chatImageAttachments.ts` and the exported helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ChatImageAttachment = {
  assetId: string;
  kind: 'image';
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  serverPath: string;
  previewUrl: string;
};

export function buildImageAttachmentPromptPrefix(attachments: ChatImageAttachment[]): string {
  // Return <image_attachment ...> blocks joined with blank lines.
}

export function readChatImageAttachments(meta: Record<string, unknown> | null | undefined): ChatImageAttachment[] {
  // Filter, normalize, and return only valid image attachments.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageAttachments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/lib/chatImageAttachments.ts \
        services/aris-web/lib/happy/types.ts \
        services/aris-web/tests/chatImageAttachments.test.ts
git commit -m "feat: add chat image attachment helpers"
```

### Task 2: 이미지 업로드 route와 저장 규칙 추가

**Files:**
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/assets/images/route.ts`
- Test: `services/aris-web/tests/chatImageUploadRoute.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
it('stores an uploaded image and returns attachment metadata', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
      method: 'POST',
      body: formDataWithPngFile,
    }),
    { params: Promise.resolve({ sessionId: 'session-1' }) },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    attachment: {
      kind: 'image',
      mimeType: 'image/png',
      serverPath: expect.stringContaining('session-1'),
      previewUrl: expect.stringContaining('/api/runtime/sessions/session-1/assets/images/'),
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageUploadRoute.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  // Require operator auth.
  // Read multipart form data.
  // Reject missing file or non-image mime types.
  // Save under a dedicated runtime asset directory.
  // Return normalized ChatImageAttachment metadata.
}
```

- [ ] **Step 4: Re-run the route test**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageUploadRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/api/runtime/sessions/[sessionId]/assets/images/route.ts \
        services/aris-web/tests/chatImageUploadRoute.test.ts
git commit -m "feat: add chat image upload route"
```

### Task 3: composer 첨부 상태와 optimistic event 확장

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/chatComposer.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Test: `services/aris-web/tests/chatComposer.test.ts`

- [ ] **Step 1: Extend the failing optimistic event test**

```ts
it('keeps image attachments on the optimistic user event meta', () => {
  const event = buildOptimisticUserEvent({
    chatId: 'chat-1',
    agent: 'codex',
    text: '이미지 확인해줘',
    submittedAt: '2026-04-11T09:00:00.000Z',
    attachments: [
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/a.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
    ],
  });

  expect(event.meta?.attachments).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatComposer.test.ts`
Expected: FAIL because `attachments` is not supported by `buildOptimisticUserEvent`.

- [ ] **Step 3: Implement composer state and optimistic meta wiring**

```ts
type ContextItem =
  | { id: string; type: 'file'; ... }
  | { id: string; type: 'text'; ... }
  | { id: string; type: 'image'; attachment: ChatImageAttachment; status: 'uploaded' | 'uploading' | 'failed' };

// ChatInterface
// - add hidden <input type="file" accept="image/*">
// - add "사진 업로드" menu action
// - call the upload route
// - render a compact thumbnail card in the composer
// - allow remove before send
```

- [ ] **Step 4: Re-run the focused test**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatComposer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/chatComposer.ts \
        services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
        services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css \
        services/aris-web/tests/chatComposer.test.ts
git commit -m "feat: add composer image attachment state"
```

### Task 4: 메시지 전송 route에 첨부 메타 전달 추가

**Files:**
- Modify: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Test: `services/aris-web/tests/sessionEventsRoute.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
it('preserves image attachments on user messages while normalizing model metadata', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/runtime/sessions/session-1/events', {
      method: 'POST',
      body: JSON.stringify({
        type: 'message',
        text: '이미지 확인',
        meta: {
          role: 'user',
          chatId: 'chat-1',
          agent: 'codex',
          attachments: [
            {
              assetId: 'asset-1',
              kind: 'image',
              name: 'screen.png',
              mimeType: 'image/png',
              size: 1200,
              serverPath: '/tmp/a.png',
              previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
            },
          ],
        },
      }),
    }),
    { params: Promise.resolve({ sessionId: 'session-1' }) },
  );

  expect(mockAppendSessionMessage).toHaveBeenCalledWith(expect.objectContaining({
    meta: expect.objectContaining({
      attachments: [expect.objectContaining({ assetId: 'asset-1' })],
    }),
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/sessionEventsRoute.test.ts`
Expected: FAIL because the route test file and attachment assertions are not implemented yet.

- [ ] **Step 3: Implement the route and send-path changes**

```ts
// ChatInterface
const imageAttachments = contextItems
  .filter((item) => item.type === 'image' && item.status === 'uploaded')
  .map((item) => item.attachment);

const finalText = `${buildImageAttachmentPromptPrefix(imageAttachments)}${text}`;

body: JSON.stringify({
  type: 'message',
  text: finalText,
  meta: {
    ...existingMeta,
    attachments: imageAttachments,
  },
});
```

- [ ] **Step 4: Re-run focused tests**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/sessionEventsRoute.test.ts tests/chatComposer.test.ts tests/chatImageAttachments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts \
        services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
        services/aris-web/tests/sessionEventsRoute.test.ts \
        services/aris-web/tests/chatComposer.test.ts \
        services/aris-web/tests/chatImageAttachments.test.ts
git commit -m "feat: send chat image attachments with user messages"
```

### Task 5: 사용자 버블 첨부 프리뷰 렌더링 추가

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Test: `services/aris-web/tests/chatImageAttachments.test.ts`

- [ ] **Step 1: Add the failing helper test for renderable attachments**

```ts
it('returns renderable image attachments from a user event meta payload', () => {
  const attachments = readChatImageAttachments({
    attachments: [
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/a.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
    ],
  });

  expect(attachments[0]?.previewUrl).toContain('/api/runtime/sessions/session-1/assets/images/');
});
```

- [ ] **Step 2: Run test to verify the helper contract is still enforced**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageAttachments.test.ts`
Expected: PASS for helper parsing, then continue to UI implementation.

- [ ] **Step 3: Implement the bubble attachment strip and fallback**

```tsx
const attachments = readChatImageAttachments(event.meta);

{attachments.length > 0 && (
  <div className={styles.messageAttachmentStrip}>
    {attachments.map((attachment) => (
      <div key={attachment.assetId} className={styles.messageAttachmentCard}>
        <img src={attachment.previewUrl} alt={attachment.name} />
        <span>{attachment.name}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Run focused verification**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageAttachments.test.ts tests/chatComposer.test.ts tests/sessionEventsRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
        services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css \
        services/aris-web/tests/chatImageAttachments.test.ts
git commit -m "feat: render chat image attachments in user bubbles"
```

### Task 6: 통합 검증과 마감

**Files:**
- Modify: `docs/superpowers/plans/2026-04-11-chat-image-attachments.md`

- [ ] **Step 1: Run the targeted test suite**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatImageAttachments.test.ts tests/chatImageUploadRoute.test.ts tests/sessionEventsRoute.test.ts tests/chatComposer.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `cd services/aris-web && ./node_modules/.bin/tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Manually verify the UX in the browser**

Check:
- composer `+` 메뉴에 `사진 업로드`가 보인다
- 업로드 직후 composer에 썸네일 카드가 보인다
- 전송 후 사용자 버블 상단에 첨부 프리뷰가 보인다
- 프리뷰 깨짐 시 fallback이 거칠지 않다

- [ ] **Step 4: Mark completed boxes and commit**

```bash
git add docs/superpowers/plans/2026-04-11-chat-image-attachments.md
git commit -m "docs: mark chat image attachment plan complete"
```
