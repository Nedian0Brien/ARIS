import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.setTimeout(90_000);

const LOGIN_RETRY_ATTEMPTS = 5;
const LOGIN_RETRY_DELAY_MS = 1_500;

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
        await page.locator('[class*="sessionDashboardLayout"]').first().waitFor({ state: 'visible', timeout: 20_000 });
        return;
      }

      lastFailure = `attempt ${attempt}: status=${payload.status} content-type=${payload.contentType || 'unknown'} body=${payload.bodyText.slice(0, 180)}`;
    } catch (error) {
      lastFailure = `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (attempt === LOGIN_RETRY_ATTEMPTS) {
      break;
    }

    await page.waitForTimeout(LOGIN_RETRY_DELAY_MS);
  }

  throw new Error(`login failed after retries: ${lastFailure}`);
}

async function resolveFirstSessionPath(page: Page) {
  const firstSessionLink = page.locator('.sessionGrid a[href^="/sessions/"]').first();
  if ((await firstSessionLink.count()) === 0) {
    return null;
  }

  const href = await firstSessionLink.getAttribute('href');
  return typeof href === 'string' && href.trim() ? href : null;
}

async function collectOverflow(page: Page, path: string) {
  const isSessionPath = path.startsWith('/sessions/');
  await page.goto(path, {
    waitUntil: isSessionPath ? 'commit' : 'domcontentloaded',
    timeout: isSessionPath ? 45_000 : 30_000,
  });

  if (path === '/') {
    await page.locator('[class*="sessionDashboardLayout"]').first().waitFor({ state: 'visible', timeout: 20_000 });
  } else if (isSessionPath) {
    await page.locator('[class*="ChatInterface_chatShell"]').first().waitFor({ state: 'visible', timeout: 30_000 });
  } else {
    await page.locator('.app-shell').first().waitFor({ state: 'visible', timeout: 20_000 });
  }

  await page.waitForTimeout(800);
  await page.screenshot({
    path: `test-results${path === '/' ? '/home-mobile.png' : `/session-mobile.png`}`,
    fullPage: true,
  });

  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const root = document.documentElement;
    const queryMetrics = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
      };
    };

    const offenders = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const htmlElement = element as HTMLElement;
        const overflow = Math.max(htmlElement.scrollWidth - htmlElement.clientWidth, 0);
        if (overflow <= 1 || htmlElement.clientWidth === 0) return null;

        const computed = window.getComputedStyle(htmlElement);
        const isIntentionalEllipsis = (
          computed.overflowX === 'hidden'
          && computed.textOverflow === 'ellipsis'
          && computed.whiteSpace === 'nowrap'
        );
        if (isIntentionalEllipsis) return null;

        return {
          tag: htmlElement.tagName.toLowerCase(),
          className: htmlElement.className,
          id: htmlElement.id,
          overflow: Number(overflow.toFixed(2)),
          clientWidth: htmlElement.clientWidth,
          scrollWidth: htmlElement.scrollWidth,
          text: (htmlElement.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.overflow - a!.overflow)
      .slice(0, 10);

    return {
      viewportWidth,
      rootScrollWidth: root.scrollWidth,
      rootOverflow: Number((root.scrollWidth - viewportWidth).toFixed(2)),
      visualViewportScale: window.visualViewport?.scale ?? 1,
      dashboardTitleRow: (() => {
        const element = document.querySelector('[class*="dashboardTitleRow"]') as HTMLElement | null;
        if (!element) return null;
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          flexDirection: window.getComputedStyle(element).flexDirection,
        };
      })(),
      dashboardLayout: (() => {
        const element = document.querySelector('[class*="sessionDashboardLayout"]') as HTMLElement | null;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          gridTemplateColumns: window.getComputedStyle(element).gridTemplateColumns,
          left: Number(rect.left.toFixed(2)),
          right: Number(rect.right.toFixed(2)),
        };
      })(),
      appShell: queryMetrics('.app-shell'),
      workspaceHomeRoot: queryMetrics('[class*="WorkspaceHome_homeRoot"]'),
      chatShell: queryMetrics('[class*="ChatInterface_chatShell"]'),
      dashboardSidebarCard: queryMetrics('[class*="SessionDashboard_sessionSidebarCard"]'),
      workspaceHomeOffenders: offenders.filter((offender) => String(offender?.className ?? '').includes('WorkspaceHome_')),
      offenders,
    };
  });
}

test('home and workspace pages stay within the mobile viewport width', async ({ page }) => {
  await login(page);

  const paths = ['/', '/?tab=console', '/?tab=files', '/?tab=settings'];
  const sessionPath = await resolveFirstSessionPath(page);
  if (sessionPath) {
    paths.push(sessionPath);
  }

  for (const path of paths) {
    const report = await collectOverflow(page, path);
    test.info().annotations.push({
      type: 'overflow-report',
      description: `${path} ${JSON.stringify(report)}`,
    });

    expect(report.rootOverflow, `${path} root overflow: ${JSON.stringify(report)}`).toBeLessThanOrEqual(1);
    expect(report.visualViewportScale, `${path} viewport scale: ${JSON.stringify(report)}`).toBe(1);

    if (path === '/') {
      expect(report.dashboardTitleRow?.clientWidth, `${path} title row width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.dashboardLayout?.clientWidth, `${path} dashboard width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.dashboardLayout?.left, `${path} dashboard left gutter: ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(12);
      expect(report.viewportWidth - (report.dashboardLayout?.right ?? report.viewportWidth), `${path} dashboard right gutter: ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(12);
      expect(report.dashboardSidebarCard?.left, `${path} dashboard card left gutter: ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(12);
      expect(report.viewportWidth - (report.dashboardSidebarCard?.right ?? report.viewportWidth), `${path} dashboard card right gutter: ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(12);
    } else if (path.startsWith('/sessions/')) {
      expect(report.workspaceHomeRoot?.clientWidth, `${path} workspace home width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.chatShell?.clientWidth, `${path} chat shell width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.workspaceHomeOffenders, `${path} workspace home offender overflow: ${JSON.stringify(report)}`).toEqual([]);
    } else {
      expect(report.appShell?.clientWidth, `${path} app shell width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
    }
  }
});
