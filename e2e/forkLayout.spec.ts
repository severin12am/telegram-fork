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

      await page.waitForFunction(() => {
        const photo = document.querySelector('[data-fork-probe="thread-photo"]') as HTMLImageElement | null;
        return !!photo && photo.naturalWidth >= 400;
      });
      const report = await page.evaluate(() => (window as any).__forkLayout);
      expect(report.overflow.left).toBeGreaterThanOrEqual(-1);
      expect(report.overflow.right).toBeLessThanOrEqual(1);
      expect(report.overflow.top).toBeGreaterThanOrEqual(-1);
      expect(report.overflow.bottom).toBeLessThanOrEqual(1);
      expect(report.sheet.top).toBeGreaterThanOrEqual(report.pinnedBottom - 2);
      expect(report.sheet.bottom).toBeLessThanOrEqual(Math.min(report.inputTop, report.replyTop) + 2);
      if(viewport.width > 925) {
        expect(report.sheet.left).toBeGreaterThanOrEqual(report.sidebarRight - 2);
        expect(Math.abs(report.sheet.right - viewport.width)).toBeLessThanOrEqual(2);
      } else {
        expect(report.sheet.left).toBeGreaterThanOrEqual(-1);
        expect(report.sheet.right).toBeLessThanOrEqual(viewport.width + 1);
      }

      const rows = page.locator('[data-fork-probe="thread-body"] .reply-loom-row');
      await expect(rows).toHaveCount(6);
      await expect(page.locator('[data-fork-probe="thread-close"]')).toBeVisible();
      expect(report.participants).toBeGreaterThanOrEqual(3);
      expect(report.depths.filter((row: {depth: string}) => Number(row.depth) > 0).length).toBeGreaterThanOrEqual(3);
      expect(report.quotes.length).toBeGreaterThanOrEqual(3);
      expect(report.photo.naturalWidth).toBeGreaterThanOrEqual(400);
      expect(report.photos).toBeGreaterThanOrEqual(5);
      expect((report.avatars || []).every((item: {hasPhoto: boolean}) => item.hasPhoto)).toBe(true);
      expect((report.connectors || []).length).toBeGreaterThanOrEqual(4);

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-fork-probe="thread-sheet"]')).not.toHaveClass(/is-open/);
    });
  }

  test('clicking персиковые after a pause starts on that word, not розовые', async({page}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await page.goto(layout + '?view=voice&clip=peach');
    const words = page.locator('.voice-score-word');
    await expect(words.first()).toBeVisible();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-fork-feature="voice-score"]');
      return root?.getAttribute('data-aligned') === 'speech';
    });

    const meta = await page.evaluate(() => (window as any).__forkLayout);
    expect(meta.persikIndex).toBe(13);
    await words.nth(meta.persikIndex).click();
    const status = page.locator('[data-fork-probe="voice-status"]');
    await expect(status).toHaveAttribute('data-word-index', '13');
    await expect(status).toHaveAttribute('data-highlight-ok', '1');
    const delta = Number(await status.getAttribute('data-delta-ms'));
    const currentMs = Number(await status.getAttribute('data-current-ms'));
    const truthMs = Number(await status.getAttribute('data-truth-ms'));
    const highlight = Number(await status.getAttribute('data-highlight-index'));
    expect(delta).toBeLessThan(150);
    expect(Math.abs(currentMs - truthMs)).toBeLessThan(150);
    expect(highlight).toBe(13);
    const rozovyeEnd = meta.truth[meta.rozovyeIndex].endMs;
    expect(currentMs).toBeGreaterThanOrEqual(rozovyeEnd - 1);
  });

  test('every word of the peach opus clip seeks and highlights itself', async({page}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await page.goto(layout + '?view=voice&clip=peach');
    await page.waitForFunction(() => {
      return document.querySelector('[data-fork-feature="voice-score"]')?.getAttribute('data-aligned') === 'speech';
    });
    const count = await page.locator('.voice-score-word').count();
    const rows = [];
    for(let i = 0; i < count; i++) {
      await page.locator('.voice-score-word').nth(i).scrollIntoViewIfNeeded();
      await page.locator('.voice-score-word').nth(i).click();
      await page.waitForFunction((index) => {
        const status = document.querySelector('[data-fork-probe="voice-status"]');
        return status?.getAttribute('data-word-index') === String(index) &&
          status.getAttribute('data-delta-ms') != null;
      }, i);
      await page.waitForTimeout(40);
      const row = {
        index: i,
        delta: Number(await page.locator('[data-fork-probe="voice-status"]').getAttribute('data-delta-ms')),
        highlight: Number(await page.locator('[data-fork-probe="voice-status"]').getAttribute('data-highlight-index')),
        ok: await page.locator('[data-fork-probe="voice-status"]').getAttribute('data-highlight-ok')
      };
      expect(row.delta).toBeLessThan(150);
      expect(row.highlight).toBe(i);
      expect(row.ok).toBe('1');
      rows.push(row);
    }
    expect(rows).toHaveLength(count);
  });
});
