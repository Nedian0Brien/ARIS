import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

async function login(page) {
  const email = process.env.MOBILE_OVERFLOW_EMAIL;
  const password = process.env.MOBILE_OVERFLOW_PASSWORD;

  if (!email || !password) {
    throw new Error('MOBILE_OVERFLOW_EMAIL and MOBILE_OVERFLOW_PASSWORD are required');
  }

  const response = await page.request.post('/api/auth/login', {
    data: { email, password, rememberMe: false },
  });
  const body = await response.json();

  if (!response.ok || body?.status !== 'success') {
    throw new Error(`login failed: ${response.status()} ${JSON.stringify(body)}`);
  }

  await page.goto('/', { waitUntil: 'networkidle' });
}

async function resolveFirstSessionPath(page) {
  const sessionId = await page.evaluate(async () => {
    const response = await fetch('/api/runtime/sessions', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`session list failed: ${response.status}`);
    }

    const payload = await response.json();
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    return sessions[0]?.id ?? null;
  });

  return sessionId ? `/sessions/${sessionId}` : null;
}

async function collectOverflow(page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
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
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
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
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          gridTemplateColumns: window.getComputedStyle(element).gridTemplateColumns,
        };
      })(),
      appShell: queryMetrics('.app-shell'),
      workspaceHomeRoot: queryMetrics('[class*="WorkspaceHome_homeRoot"]'),
      chatShell: queryMetrics('[class*="ChatInterface_chatShell"]'),
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
    } else if (path.startsWith('/sessions/')) {
      expect(report.workspaceHomeRoot?.clientWidth, `${path} workspace home width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.chatShell?.clientWidth, `${path} chat shell width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
      expect(report.workspaceHomeOffenders, `${path} workspace home offender overflow: ${JSON.stringify(report)}`).toEqual([]);
    } else {
      expect(report.appShell?.clientWidth, `${path} app shell width: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.viewportWidth + 1);
    }
  }
});
