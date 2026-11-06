import {expect, test} from '@playwright/test';

const layout = '/fork-layout.html';
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;
if(chromePath) {
  test.use({launchOptions: {executablePath: chromePath}});
}

const VIEWPORTS = [
  {name: 'desktop-1280', width: 1280, height: 800},
  {name: 'desktop-1920', width: 1920, height: 1080},
  {name: 'mobile-390', width: 390, height: 844}
] as const;

test.describe('real chat layout fixture', () => {
  for(const viewport of VIEWPORTS) {
    test(`thread sheet fits the chat column at ${viewport.name}`, async({page}) => {
      await page.setViewportSize({width: viewport.width, height: viewport.height});
      await page.goto(layout + '?view=thread');
      const sheet = page.locator('[data-fork-probe="thread-sheet"], .reply-loom-sheet');
      await expect(sheet).toBeVisible();
      await page.waitForFunction(() => {
        const report = (window as any).__forkLayout;
        return report && report.sheet && report.sheet.height > 40;
      });

      const report = await page.evaluate(() => (window as any).__forkLayout);
      expect(report.overflow.left).toBeGreaterThanOrEqual(-1);
      expect(report.overflow.right).toBeLessThanOrEqual(1);
      expect(report.overflow.top).toBeGreaterThanOrEqual(-1);
      expect(report.overflow.bottom).toBeLessThanOrEqual(1);
      expect(report.sheet.top).toBeGreaterThanOrEqual(report.pinnedBottom - 2);
      expect(report.sheet.bottom).toBeLessThanOrEqual(report.inputTop + 2);
      if(viewport.width > 925) {
        expect(report.sheet.left).toBeGreaterThanOrEqual(report.sidebarRight - 2);
        expect(Math.abs(report.sheet.right - viewport.width)).toBeLessThanOrEqual(2);
      } else {
        expect(report.sheet.left).toBeGreaterThanOrEqual(-1);
        expect(report.sheet.right).toBeLessThanOrEqual(viewport.width + 1);
      }

      const rows = page.locator('[data-fork-probe="thread-body"] .reply-loom-row');
      await expect(rows).toHaveCount(6);
    });
  }

  test('clicking Они after a pause starts within 100ms of the speech onset', async({page}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await page.goto(layout + '?view=voice');
    const words = page.locator('.voice-score-word');
    await expect(words.first()).toBeVisible();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-fork-feature="voice-score"]');
      return root?.getAttribute('data-aligned') === 'speech';
    });

    const oniIndex = await page.evaluate(() => (window as any).__forkLayout.oniIndex);
    const onset2Ms = await page.evaluate(() => (window as any).__forkLayout.onset2Ms);
    expect(oniIndex).toBeGreaterThan(0);
    await words.nth(oniIndex).click();
    const status = page.locator('[data-fork-probe="voice-status"]');
    await expect(status).toHaveAttribute('data-word-index', String(oniIndex));
    const delta = Number(await status.getAttribute('data-delta-ms'));
    const currentMs = Number(await status.getAttribute('data-current-ms'));
    expect(delta).toBeLessThan(100);
    expect(Math.abs(currentMs - onset2Ms)).toBeLessThan(100);
  });
});
