import {expect, test} from '@playwright/test';

const playground = '/fork-playground.html';
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;
if(chromePath) {
  test.use({launchOptions: {executablePath: chromePath}});
}

test.describe('fork playground v3', () => {
  test('Voice Score: clicking word N starts within word N', async({page}) => {
    await page.goto(playground + '?f=1');
    const words = page.locator('.voice-score-word');
    await expect(words.first()).toBeVisible();
    const count = await words.count();
    expect(count).toBeGreaterThan(4);

    const n = 3;
    await words.nth(n).click();
    const status = page.locator('[data-fork-probe="voice-status"]');
    await expect(status).toContainText(`word ${n}`);
    await expect(status).toHaveAttribute('data-word-index', String(n));
    await expect(status).not.toContainText('FAIL');
  });

  test('Fan Close all is a real button, not an i18n key', async({page}) => {
    await page.goto(playground + '?f=3');
    const close = page.locator('[data-fork-action="fan-close"]');
    await expect(close).toBeVisible();
    await expect(close).toHaveText('Close all');
    await expect(close).not.toContainText('ForkFeatures');
    const box = await close.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThan(28);
    expect(box!.width).toBeGreaterThan(100);
    await close.click();
    await expect(page.locator('.fan-stage')).not.toHaveClass(/is-open/);
  });

  test('Fan wheel does not open mid-list, only overscroll at top', async({page}) => {
    await page.goto(playground + '?f=3');
    await page.locator('[data-fork-action="fan-close"]').click();
    const list = page.locator('[data-fork-probe="fan-list"]');
    await expect(list).toBeVisible();
    const scrolled = await list.evaluate((node) => {
      node.scrollTop = Math.min(240, node.scrollHeight - node.clientHeight);
      return node.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(40);
    await list.evaluate((node, top) => {
      (node as HTMLElement).scrollTop = top;
      node.dispatchEvent(new WheelEvent('wheel', {deltaY: -400, bubbles: true}));
    }, scrolled);
    const probe = page.locator('[data-fork-probe="fan-wheel"]');
    await expect(probe).toContainText(`scrollTop ${scrolled | 0}`);
    await expect(probe).toContainText('blocked yes');
    await expect(probe).toContainText('open no');
    await expect(page.locator('.fan-stage')).not.toHaveClass(/is-open/);
  });

  test('Thread sheet sits below the pinned bar and lists the full 6-message tree', async({page}) => {
    await page.goto(playground + '?f=2');
    const pinned = page.locator('[data-fork-probe="pinned-bar"]');
    const sheet = page.locator('.reply-loom-sheet.is-open');
    const head = sheet.locator('.reply-loom-sheet-head');
    await expect(pinned).toBeVisible();
    await expect(head).toBeVisible();
    const pinnedBox = await pinned.boundingBox();
    const headBox = await head.boundingBox();
    expect(pinnedBox && headBox).toBeTruthy();
    expect(headBox!.y).toBeGreaterThanOrEqual(pinnedBox!.y + pinnedBox!.height - 1);
    const rows = page.locator('[data-fork-probe="thread-body"] .reply-loom-row');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('.reply-loom-sender')).toContainText(['Maya Chen', 'Jules Adeyemi', 'Alex Park', 'Sam Okonkwo']);
  });
});
