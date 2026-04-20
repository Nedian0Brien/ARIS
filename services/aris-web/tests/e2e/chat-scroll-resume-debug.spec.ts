import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

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

async function resetScrollDebug(page: Page) {
  await page.evaluate(() => {
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

async function captureScrollReport(page: Page, label: string) {
  await waitForScrollDebugQuiet(page);
  return page.evaluate((stepLabel) => {
    const events = window.__ARIS_SCROLL_DEBUG__?.events ?? [];
    const resumeEvents = events.filter((event) => {
      const source = String(event.source ?? '');
      return source.startsWith('resume:') || source.startsWith('session-scroll:');
    });
    return {
      label: stepLabel,
      finalScrollY: window.scrollY,
      finalInnerHeight: window.innerHeight,
      finalVisualViewportHeight: window.visualViewport?.height ?? null,
      finalDocumentScrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      resumeEvents,
      events,
    };
  }, label);
}

function persistDebugReport(testInfo: TestInfo, report: unknown) {
  const reportPath = testInfo.outputPath('chat-scroll-resume-debug.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`chat-scroll-resume-debug report: ${reportPath}`);
}

test('captures mobile scroll traces for tab resume and back-forward resume', async ({ page, context }, testInfo) => {
  await enableScrollDebug(context);
  await login(page);

  const sessionPath = await resolveFirstSessionPath(page);
  expect(sessionPath).toBeTruthy();
  if (!sessionPath) {
    return;
  }

  await page.goto(sessionPath, { waitUntil: 'commit', timeout: 45_000 });
  await page.locator('[class*="ChatInterface_chatShell"]').first().waitFor({ state: 'visible', timeout: 30_000 });

  await resetScrollDebug(page);
  const backgroundPage = await context.newPage();
  await backgroundPage.goto('/login', { waitUntil: 'domcontentloaded' });
  await backgroundPage.bringToFront();
  await page.waitForTimeout(700);
  await page.bringToFront();
  await page.locator('[class*="ChatInterface_chatShell"]').first().waitFor({ state: 'visible', timeout: 30_000 });
  const tabResumeReport = await captureScrollReport(page, 'tab-resume');
  await backgroundPage.close();

  await resetScrollDebug(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.goBack({ waitUntil: 'commit', timeout: 45_000 });
  await page.locator('[class*="ChatInterface_chatShell"]').first().waitFor({ state: 'visible', timeout: 30_000 });
  const backForwardResumeReport = await captureScrollReport(page, 'back-forward-resume');

  const report = {
    sessionPath,
    tabResumeReport,
    backForwardResumeReport,
  };
  persistDebugReport(testInfo, report);

  expect(tabResumeReport.events.length).toBeGreaterThan(0);
  expect(backForwardResumeReport.events.length).toBeGreaterThan(0);
});
