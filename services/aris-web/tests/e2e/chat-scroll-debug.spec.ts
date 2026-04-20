import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

test.setTimeout(90_000);

const LOGIN_RETRY_ATTEMPTS = 5;
const LOGIN_RETRY_DELAY_MS = 1_500;

async function enableScrollDebug(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('aris:scroll-debug', '1');
    window.__ARIS_SCROLL_DEBUG__ = {
      enabled: true,
      events: [],
    };
  });
}

async function login(page: Page) {
  const email = process.env.MOBILE_OVERFLOW_EMAIL;
  const password = process.env.MOBILE_OVERFLOW_PASSWORD;

  if (!email || !password) {
    throw new Error('MOBILE_OVERFLOW_EMAIL and MOBILE_OVERFLOW_PASSWORD are required');
  }

  let lastFailure = '';

  for (let attempt = 1; attempt <= LOGIN_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      const payload = await page.evaluate(async ({ loginEmail, loginPassword }) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail, password: loginPassword, rememberMe: false }),
        });
        const bodyText = await response.text();
        return {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type') ?? '',
          bodyText,
        };
      }, { loginEmail: email, loginPassword: password });

      let body: { status?: string } | null = null;
      if (payload.contentType.includes('application/json')) {
        try {
          body = JSON.parse(payload.bodyText);
        } catch {
          body = null;
        }
      }

      if (payload.ok && body?.status === 'success') {
        await page.goto('/', { waitUntil: 'networkidle' });
        return;
      }

      lastFailure = `attempt ${attempt}: status=${payload.status} body=${payload.bodyText.slice(0, 160)}`;
    } catch (error) {
      lastFailure = `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (attempt < LOGIN_RETRY_ATTEMPTS) {
      await page.waitForTimeout(LOGIN_RETRY_DELAY_MS);
    }
  }

  throw new Error(`login failed after retries: ${lastFailure}`);
}

async function waitForScrollDebugQuiet(page: Page, quietMs = 1_500, timeoutMs = 12_000) {
  const start = Date.now();
  let previousLength = -1;
  let stableSince = Date.now();

  while (Date.now() - start < timeoutMs) {
    const nextLength = await page.evaluate(() => window.__ARIS_SCROLL_DEBUG__?.events.length ?? 0);
    if (nextLength === previousLength) {
      if (Date.now() - stableSince >= quietMs) {
        return;
      }
    } else {
      previousLength = nextLength;
      stableSince = Date.now();
    }
    await page.waitForTimeout(250);
  }
}

async function resolveFirstSessionPath(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/runtime/sessions', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const body = await response.json() as { sessions?: Array<{ id?: string }> };
    const sessionIds = body.sessions
      ?.map((session) => (typeof session.id === 'string' ? session.id.trim() : ''))
      .filter(Boolean) ?? [];

    for (const sessionId of sessionIds) {
      const chatsResponse = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats`, { cache: 'no-store' });
      if (!chatsResponse.ok) {
        continue;
      }
      const chatsBody = await chatsResponse.json() as { chats?: Array<{ id?: string }> };
      const chatIds = chatsBody.chats
        ?.map((chat) => (typeof chat.id === 'string' ? chat.id.trim() : ''))
        .filter(Boolean) ?? [];
      if (chatIds.length === 0) {
        continue;
      }

      const snapshotsResponse = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/sidebar?${chatIds.map((chatId) => `chatId=${encodeURIComponent(chatId)}`).join('&')}`,
        { cache: 'no-store' },
      );
      if (!snapshotsResponse.ok) {
        continue;
      }
      const snapshotsBody = await snapshotsResponse.json() as { snapshots?: Array<{ chatId?: string; hasEvents?: boolean }> };
      const activeChatId = snapshotsBody.snapshots?.find((snapshot) => snapshot.hasEvents && typeof snapshot.chatId === 'string')?.chatId
        ?? chatIds[0];

      if (activeChatId) {
        return `/sessions/${encodeURIComponent(sessionId)}?chat=${encodeURIComponent(activeChatId)}`;
      }
    }

    return null;
  });
}

test('captures scroll writers when switching away from chat and back on mobile', async ({ page, context }) => {
  await enableScrollDebug(context);
  await login(page);

  const sessionPath = await resolveFirstSessionPath(page);
  expect(sessionPath).toBeTruthy();
  if (!sessionPath) {
    return;
  }

  await page.goto(sessionPath, { waitUntil: 'commit', timeout: 45_000 });
  await page.locator('[class*="ChatInterface_chatShell"]').first().waitFor({ state: 'visible', timeout: 30_000 });
  await waitForScrollDebugQuiet(page);

  await page.evaluate(() => {
    window.__ARIS_SCROLL_DEBUG__ = {
      enabled: true,
      events: [],
    };
  });

  const before = await page.evaluate(() => ({
    scrollY: window.scrollY,
    phaseEvents: window.__ARIS_SCROLL_DEBUG__?.events.length ?? 0,
  }));

  await page.getByRole('button', { name: '다음 작업 화면으로 이동', exact: true }).click();
  await page.getByRole('button', { name: '채팅으로 돌아가기', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '채팅으로 돌아가기', exact: true }).click();
  await page.waitForTimeout(2_000);

  const report = await page.evaluate(() => ({
    scrollY: window.scrollY,
    events: window.__ARIS_SCROLL_DEBUG__?.events ?? [],
  }));

  test.info().annotations.push({
    type: 'chat-scroll-debug',
    description: JSON.stringify({
      before,
      afterScrollY: report.scrollY,
      events: report.events,
    }),
  });
  console.log('chat-scroll-debug', JSON.stringify({
    before,
    afterScrollY: report.scrollY,
    events: report.events,
  }));

  expect(report.events.length).toBeGreaterThan(0);
  expect(report.events.some((event) => String(event.source).startsWith('tail:restore-entry:'))).toBe(true);
});
