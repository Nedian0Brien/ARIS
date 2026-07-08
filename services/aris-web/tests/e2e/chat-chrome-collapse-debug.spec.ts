import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * 모바일 채팅 화면의 스크롤 연동 크롬 자동 숨김 + 컴포저 pill 축소 동작 검증.
 *
 * 실행 예시 (워크트리 dev 서버 기준):
 *   MOBILE_OVERFLOW_BASE_URL=http://127.0.0.1:3315 \
 *   CHAT_CHROME_PROJECT_ID=<projectId> \
 *   npx playwright test tests/e2e/chat-chrome-collapse-debug.spec.ts --project=mobile-chromium
 */

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
      // baseURL이 dev proxy(/proxy/<port>/) 하위일 수 있으므로 상대 경로로 접근한다.
      await page.goto('login', { waitUntil: 'domcontentloaded' });
      const payload = await page.evaluate(async ({ loginEmail, loginPassword }) => {
        const response = await fetch(new URL('api/auth/login', window.location.href).toString(), {
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
        return;
      }

      lastFailure = `attempt ${attempt}: status=${payload.status} body=${payload.bodyText.slice(0, 180)}`;
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

async function openProjectChatScreen(page: Page, projectId: string) {
  await page.goto(`./?tab=project&project=${projectId}&view=chat`, { waitUntil: 'domcontentloaded' });
  await page.locator('.aris-ia-shell').first().waitFor({ state: 'visible', timeout: 20_000 });

  const chatScreen = page.locator('[data-project-chat-screen]');
  const chatCard = page.locator('.pc-chat-card').first();
  await Promise.race([
    chatScreen.waitFor({ state: 'visible', timeout: 20_000 }),
    chatCard.waitFor({ state: 'visible', timeout: 20_000 }),
  ]).catch(() => {});

  if (!(await chatScreen.isVisible().catch(() => false))) {
    await chatCard.click();
  }
  await chatScreen.waitFor({ state: 'visible', timeout: 20_000 });
  // 초기 tail 스크롤의 suppress 윈도우(350ms)가 지나가도록 잠시 대기
  await page.waitForTimeout(900);
}

/** dev 전용 오버레이(Next dev 배지, react-grab)는 스크린샷/클릭을 방해하므로 제거 */
function removeDevOverlays(page: Page) {
  return page.evaluate(() => {
    document.querySelector('nextjs-portal')?.remove();
    document.querySelector('[data-testid="react-grab-overlay"]')?.remove();
  });
}

function timelineScrollBy(page: Page, deltaPx: number) {
  return page.evaluate((delta) => {
    const timeline = document.querySelector<HTMLElement>('[data-project-chat-screen] .tl');
    if (!timeline) throw new Error('timeline not found');
    timeline.scrollTop += delta;
    // Playwright WebKit의 isMobile 에뮬레이션은 요소 scroll 이벤트를 크게 지연/병합
    // 전달하므로, 엔진과 무관하게 핸들러가 즉시 실행되도록 명시적으로 디스패치한다.
    timeline.dispatchEvent(new Event('scroll'));
  }, deltaPx);
}

test('스크롤 시 상단 크롬 숨김/복원과 컴포저 pill 축소·확장·auto-grow', async ({ page }) => {
  const projectId = process.env.CHAT_CHROME_PROJECT_ID;
  test.skip(!projectId, 'CHAT_CHROME_PROJECT_ID is required');

  await login(page);
  await openProjectChatScreen(page, projectId!);

  const chatScreen = page.locator('[data-project-chat-screen]');
  const topbar = page.locator('.m-top');
  const chatHeader = page.locator('[data-project-chat-screen] .ch');
  const timeline = page.locator('[data-project-chat-screen] .tl');
  const composerInput = page.locator('[data-project-chat-screen] .cmp-wrap .cmp__input');

  // 초기 상태: 크롬 표시 + 컴포저 확장
  await expect(chatScreen).toHaveAttribute('data-chrome', 'visible');
  await expect(chatScreen).toHaveAttribute('data-composer', 'expanded');
  await expect(topbar).toBeVisible();

  const initialTimelineHeight = await timeline.evaluate((node) => node.clientHeight);
  // 컴포저는 오버레이라서 확보 공간은 타임라인 하단 패딩(--pc-composer-height 연동)으로 측정
  const expandedTimelinePadding = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingBottom),
  );

  // 스크롤 가능하도록 스페이서 주입 후 최상단 근처로 이동
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('[data-project-chat-screen] .tl__container');
    if (!container) throw new Error('timeline container not found');
    const spacer = document.createElement('div');
    spacer.style.height = '4000px';
    spacer.dataset.testSpacer = 'true';
    container.appendChild(spacer);
    const timelineNode = document.querySelector<HTMLElement>('[data-project-chat-screen] .tl');
    if (timelineNode) timelineNode.scrollTop = 0;
  });
  await page.waitForTimeout(500);

  // 아래로 스크롤(연속 이벤트) → 크롬 숨김 + 컴포저 축소
  await timelineScrollBy(page, 200);
  await page.waitForTimeout(120);
  await timelineScrollBy(page, 200);
  await page.waitForTimeout(120);
  await timelineScrollBy(page, 200);
  await expect(chatScreen).toHaveAttribute('data-chrome', 'hidden');
  await expect(chatScreen).toHaveAttribute('data-composer', 'collapsed');
  // opacity는 트랜지션 속성이라 headless 환경에서 중간값에 머물 수 있으므로
  // 즉시 적용되는 pointer-events로 숨김 상태를 판정한다.
  await expect
    .poll(() => topbar.evaluate((node) => window.getComputedStyle(node).pointerEvents))
    .toBe('none');
  await expect
    .poll(() => chatHeader.evaluate((node) => window.getComputedStyle(node).pointerEvents))
    .toBe('none');

  // pill이 나타나고, 타임라인이 실제로 세로 공간을 얻었는지 확인
  await expect(page.locator('[data-project-chat-screen] .cmp-pill')).toBeVisible();
  await page.waitForTimeout(400);
  const collapsedTimelinePadding = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingBottom),
  );
  const hiddenTimelineHeight = await timeline.evaluate((node) => node.clientHeight);
  expect(collapsedTimelinePadding).toBeLessThan(expandedTimelinePadding - 40);
  expect(hiddenTimelineHeight).toBeGreaterThan(initialTimelineHeight + 80);
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-chrome-collapsed.png' });

  // 위로 스크롤 → 크롬 복원, 컴포저는 축소 유지
  await timelineScrollBy(page, -120);
  await expect(chatScreen).toHaveAttribute('data-chrome', 'visible');
  await expect(chatScreen).toHaveAttribute('data-composer', 'collapsed');

  // pill 터치 → 확장 + 입력 포커스
  await removeDevOverlays(page);
  await page.locator('[data-project-chat-screen] .cmp-pill').click();
  await expect(chatScreen).toHaveAttribute('data-composer', 'expanded');
  await expect(composerInput).toBeFocused();
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-chrome-expanded.png' });

  // auto-grow: 입력 줄 수에 따라 높이가 늘고 max-height에서 멈춘다
  const singleLineHeight = await composerInput.evaluate((node) => node.getBoundingClientRect().height);
  await composerInput.fill(Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n'));
  const grownHeight = await composerInput.evaluate((node) => node.getBoundingClientRect().height);
  expect(grownHeight).toBeGreaterThan(singleLineHeight + 40);

  await composerInput.fill(Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
  const cappedHeight = await composerInput.evaluate((node) => node.getBoundingClientRect().height);
  const maxAllowed = await composerInput.evaluate((node) => {
    const viewport = window.innerHeight;
    return Math.min(200, viewport * 0.3);
  });
  expect(cappedHeight).toBeLessThanOrEqual(maxAllowed + 1);
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-composer-autogrow.png' });

  // 확장(포커스) 상태에서는 스크롤해도 컴포저가 다시 축소되지 않는다
  await timelineScrollBy(page, 300);
  await page.waitForTimeout(400);
  await expect(chatScreen).toHaveAttribute('data-composer', 'expanded');

  // 드래프트가 있는 채로 다시 축소하면 pill에 드래프트 텍스트가 표시된다
  await composerInput.evaluate((node) => (node as HTMLTextAreaElement).blur());
  await timelineScrollBy(page, -80);
  await expect(chatScreen).toHaveAttribute('data-composer', 'collapsed');
  const pillText = page.locator('[data-project-chat-screen] .cmp-pill__text');
  await expect(pillText).toHaveClass(/cmp-pill__text--draft/);
  await expect(pillText).toContainText('line 1');
  await removeDevOverlays(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/chat-pill-draft.png' });
});
