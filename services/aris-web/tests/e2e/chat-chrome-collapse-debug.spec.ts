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

test.setTimeout(180_000);

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

  // headless WebKit이 CSS 애니메이션을 얼려 스크린샷이 from-상태(opacity 0)로
  // 찍히는 문제를 피한다 — reduced-motion 경로에서는 애니메이션이 꺼진다.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await openProjectChatScreen(page, projectId!);

  const chatScreen = page.locator('[data-project-chat-screen]');
  const topbar = page.locator('.m-top');
  const chatHeader = page.locator('[data-project-chat-screen] .ch');
  const timeline = page.locator('[data-project-chat-screen] .tl');
  const composerInput = page.locator('[data-project-chat-screen] .cmp-wrap .cmp__input');

  // 초기 상태: 크롬 표시 + 컴포저 확장. 앱 탑바는 모바일 채팅 화면에서 항상
  // 렌더링되지 않고(1줄 헤더 병합), 채팅 헤더(.ch)가 유일한 헤더다.
  await expect(chatScreen).toHaveAttribute('data-chrome', 'visible');
  await expect(chatScreen).toHaveAttribute('data-composer', 'expanded');
  await expect(topbar).toBeHidden();
  await expect(chatHeader).toHaveCount(1);
  await expect(chatHeader).toBeVisible();

  // 앱 탑바가 사라진 대신, 홈 이동/설정/테마가 채팅 헤더의 More 메뉴로
  // 기능 손실 없이 통합되어 있어야 한다.
  await removeDevOverlays(page);
  await page.locator('[data-project-chat-screen] .ch__action[aria-label="More chat actions"]').click();
  await expect(page.locator('.ch-context-menu')).toBeVisible();
  const mergedMenuItems = page.locator('.ch-context-menu .m-context-menu__item');
  await expect(mergedMenuItems).toContainText(['홈으로 이동', '설정']);
  await expect(page.locator('.ch-context-menu .m-theme-toggle__item')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/chat-single-header-menu.png' });
  await page.locator('[data-project-chat-screen] .ch__action[aria-label="More chat actions"]').click();
  await expect(page.locator('.ch-context-menu')).toHaveCount(0);

  // 타임라인 박스 자체(top/height)는 헤더 표시 여부와 무관하게 항상 고정이어야
  // 한다 — 헤더는 오버레이이고 확보 공간은 padding-top으로만 표현되므로,
  // 스크롤 중 .tl의 화면상 위치가 흔들리지 않는다(= 스크롤이 움직이는 버그 없음).
  const fixedTimelineTop = await timeline.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  const initialTimelineHeight = await timeline.evaluate((node) => node.clientHeight);
  // 컴포저는 오버레이라서 확보 공간은 타임라인 하단 패딩(--pc-composer-height 연동)으로 측정
  const expandedTimelinePadding = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingBottom),
  );
  const expandedTimelinePaddingTop = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingTop),
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
  // 헤더는 숨김 시 화면 밖으로 옮기는 게 아니라 아예 언마운트된다(true unmount).
  await expect(chatHeader).toHaveCount(0);

  // pill이 나타나고, 타임라인이 실제로 세로 공간을 얻었는지 확인.
  // 타임라인의 박스 자체(top/height)는 그대로이고 padding만 줄어야 한다 —
  // 헤더/컴포저 표시 여부가 .tl의 화면상 위치를 흔들면 안 된다.
  await expect(page.locator('[data-project-chat-screen] .cmp-pill')).toBeVisible();
  await page.waitForTimeout(400);
  const collapsedTimelinePadding = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingBottom),
  );
  const collapsedTimelinePaddingTop = await timeline.evaluate(
    (node) => Number.parseFloat(window.getComputedStyle(node).paddingTop),
  );
  const collapsedTimelineTop = await timeline.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  const collapsedTimelineHeight = await timeline.evaluate((node) => node.clientHeight);
  expect(collapsedTimelinePadding).toBeLessThan(expandedTimelinePadding - 40);
  expect(collapsedTimelinePaddingTop).toBeLessThan(expandedTimelinePaddingTop - 20);
  expect(collapsedTimelineTop).toBe(fixedTimelineTop);
  expect(collapsedTimelineHeight).toBe(initialTimelineHeight);
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-chrome-collapsed.png' });

  // 위로 스크롤 → 크롬 복원(헤더 재마운트), 컴포저는 축소 유지
  await timelineScrollBy(page, -120);
  await expect(chatScreen).toHaveAttribute('data-chrome', 'visible');
  await expect(chatScreen).toHaveAttribute('data-composer', 'collapsed');
  await expect(chatHeader).toHaveCount(1);
  await expect(chatHeader).toBeVisible();
  expect(await timeline.evaluate((node) => Math.round(node.getBoundingClientRect().top))).toBe(fixedTimelineTop);

  // pill 본문 터치 → 확장 + 입력 포커스
  await removeDevOverlays(page);
  await page.locator('[data-project-chat-screen] .cmp-pill__body').click();
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

  // pill의 + 버튼 → 액션 시트: 빠른 작업 2개 + 스킬·플러그인 목록이 한 뷰에 있다
  await page.locator('[data-project-chat-screen] .cmp-pill__add').click();
  await expect(page.locator('.pc-sheet__panel')).toBeVisible();
  await expect(page.locator('.pc-sheet__item')).toHaveCount(2);
  await expect(page.locator('.pc-sheet__section')).toBeVisible();
  await expect
    .poll(async () => {
      const skillCount = await page.locator('.pc-sheet__skill').count();
      const stateCount = await page.locator('.pc-sheet__state').count();
      return skillCount + stateCount;
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/chat-action-sheet.png' });

  // 검색 필터: 일치하지 않는 검색어 → 빈 상태, 지우면 목록 복귀
  const searchInput = page.locator('.pc-sheet__search-input');
  await expect(searchInput).toBeVisible();
  const skillCountBefore = await page.locator('.pc-sheet__skill').count();
  if (skillCountBefore > 0) {
    await searchInput.fill('zzzz-not-a-skill');
    await expect(page.locator('.pc-sheet__skill')).toHaveCount(0);
    await expect(page.locator('.pc-sheet__state')).toBeVisible();
    await page.locator('.pc-sheet__search-clear').click();
    await expect(page.locator('.pc-sheet__skill')).toHaveCount(skillCountBefore);
  }

  // 목록이 길면 시트 내부 스크롤로 탐색할 수 있다
  await page.locator('.pc-sheet__scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/chat-action-sheet-skills.png' });

  // 스킬을 탭하면 슬래시 커맨드가 프롬프트 앞에 삽입되고 컴포저가 확장된다
  let insertedCommand: string | null = null;
  const firstSkill = page.locator('.pc-sheet__skill').first();
  if (await firstSkill.count()) {
    insertedCommand = await firstSkill.locator('.pc-sheet__skill-command').innerText();
    await firstSkill.click();
    await expect(page.locator('.pc-sheet__panel')).toHaveCount(0);
    await expect(chatScreen).toHaveAttribute('data-composer', 'expanded');
    await expect(composerInput).toHaveValue(new RegExp(`^${insertedCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
  } else {
    await page.locator('.pc-sheet__close').click();
    await expect(page.locator('.pc-sheet__panel')).toHaveCount(0);
  }

  // 사진 첨부: 숨김 파일 입력에 직접 주입 → 업로드 후 칩 표시
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.locator('[data-project-chat-screen] input[type="file"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.locator('[data-project-chat-screen] .cmp-attachment__thumb')).toBeVisible({ timeout: 15_000 });
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-attachment-chip.png' });

  // 첨부 제거 버튼으로 칩이 사라진다
  await page.locator('[data-project-chat-screen] .cmp-attachment__remove').click();
  await expect(page.locator('[data-project-chat-screen] .cmp-attachment')).toHaveCount(0);

  // 최근 사용: 방금 선택한 스킬이 시트를 다시 열면 상단에 고정된다
  if (insertedCommand) {
    await page.locator('[data-project-chat-screen] .cmp__tool[aria-label="Add"]').click();
    await expect(page.locator('.pc-sheet__panel')).toBeVisible();
    await expect(page.locator('.pc-sheet__group-label').first()).toHaveText('최근 사용');
    await expect(page.locator('.pc-sheet__skill').first()).toContainText(insertedCommand);
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test-results/chat-action-sheet-recent.png' });
    await page.locator('.pc-sheet__close').click();
    await expect(page.locator('.pc-sheet__panel')).toHaveCount(0);
  }

  // `/` 인라인 자동완성: 입력 → 목록 표시, Enter → 최상단 항목 삽입
  await composerInput.fill('/');
  await expect(page.locator('[data-project-chat-screen] .cmp-slash')).toBeVisible();
  const slashFirstItem = page.locator('[data-project-chat-screen] .cmp-slash__item').first();
  await expect(slashFirstItem).toBeVisible();
  await page.waitForTimeout(250);
  await removeDevOverlays(page);
  await page.screenshot({ path: 'test-results/chat-slash-autocomplete.png' });
  const slashFirstCommand = await slashFirstItem.locator('.cmp-slash__command').innerText();
  await composerInput.press('Enter');
  await expect(composerInput).toHaveValue(`${slashFirstCommand} `);
  await expect(page.locator('[data-project-chat-screen] .cmp-slash')).toHaveCount(0);

  // 일치하는 스킬이 없으면 팝업이 뜨지 않는다 (경로 입력 등을 방해하지 않음)
  await composerInput.fill('/zzz-not-a-skill');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-project-chat-screen] .cmp-slash')).toHaveCount(0);
});

test('컴포저 포커스 후 키보드가 열려도 html/body의 position은 절대 바뀌지 않는다 (네이티브 스크롤과 협력)', async ({ page }) => {
  const projectId = process.env.CHAT_CHROME_PROJECT_ID;
  test.skip(!projectId, 'CHAT_CHROME_PROJECT_ID is required');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await openProjectChatScreen(page, projectId!);
  await removeDevOverlays(page);

  // ChatGPT 웹 모바일 실측으로 확인한 전략: html/body의 position은 키보드
  // 상태와 무관하게 항상 static이어야 한다. position:static → fixed 전환은
  // 스펙상 transition이 불가능해, 이전엔 네이티브 스크롤이 컴포저를 끌어올린
  // "직후" 잠금이 뒤늦게 걸리며 순간이동(스냅)하는 것으로 보였다.
  const beforeFocus = await page.evaluate(() => ({
    keyboardOpen: document.documentElement.dataset.keyboardOpen,
    bodyPosition: getComputedStyle(document.body).position,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));
  expect(beforeFocus.keyboardOpen).toBe('false');
  expect(beforeFocus.bodyPosition).toBe('static');
  // overflow-x: clip(hidden 아님)이므로 overflow-y가 auto로 자동 승격되지 않아야 한다.
  expect(beforeFocus.bodyOverflowY).not.toBe('auto');

  const composerInput = page.locator('[data-project-chat-screen] .cmp-wrap .cmp__input');
  await composerInput.click();
  const immediatelyAfterFocus = await page.evaluate(() => document.documentElement.dataset.keyboardOpen);
  expect(immediatelyAfterFocus).toBe('true');

  // 실제 모바일 키보드가 열리는 것을 흉내낸다: visualViewport.height/offsetTop을
  // 여러 단계로 바꿔가며 resize 이벤트를 발생시킨다(ViewportHeightSync가 구독).
  for (const { height, offsetTop } of [
    { height: 664, offsetTop: 0 },
    { height: 460, offsetTop: 20 },
    { height: 380, offsetTop: 34 },
    { height: 380, offsetTop: 34 },
  ]) {
    await page.evaluate(({ h, o }) => {
      Object.defineProperty(window.visualViewport, 'height', { get: () => h, configurable: true });
      Object.defineProperty(window.visualViewport, 'offsetTop', { get: () => o, configurable: true });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    }, { h: height, o: offsetTop });
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => ({
    keyboardOpen: document.documentElement.dataset.keyboardOpen,
    bodyPosition: getComputedStyle(document.body).position,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlPosition: getComputedStyle(document.documentElement).position,
    visualViewportHeight: window.visualViewport?.height,
  }));
  expect(state.keyboardOpen).toBe('true');
  // 키보드가 열려도 position은 절대 바뀌지 않는다 — 이게 이번 재설계의 핵심.
  expect(state.bodyPosition).toBe('static');
  expect(state.htmlPosition).toBe('static');
  expect(state.bodyOverflowY).not.toBe('auto');

  // 컴포저 auto-grow 상한이 실제 보이는 높이 기준으로 줄어드는지 확인한다
  // (position/scroll과 무관한 순수 시각 제약이라 여기선 안전하게 반응해야 한다).
  const cmpInputMaxHeight = await composerInput.evaluate((node) => getComputedStyle(node).maxHeight);
  expect(Number.parseFloat(cmpInputMaxHeight)).toBeLessThanOrEqual(Math.round((state.visualViewportHeight ?? 0) * 0.3) + 1);

  await page.screenshot({ path: 'test-results/chat-keyboard-open-no-overflow.png' });

  // blur 후에는 낙관적 잠금과 실측 상태 모두 해제되어 평상시 모델로 복귀해야 한다.
  await composerInput.evaluate((node) => (node as HTMLElement).blur());
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { get: () => 844, configurable: true });
    Object.defineProperty(window.visualViewport, 'offsetTop', { get: () => 0, configurable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(900);
  const afterBlur = await page.evaluate(() => ({
    keyboardOpen: document.documentElement.dataset.keyboardOpen,
    bodyPosition: getComputedStyle(document.body).position,
  }));
  expect(afterBlur.keyboardOpen).toBe('false');
  expect(afterBlur.bodyPosition).toBe('static');
});
