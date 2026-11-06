import {chromium} from '@playwright/test';
import {mkdirSync} from 'fs';
import {join} from 'path';

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:43123';
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || '/usr/bin/google-chrome-stable';
const outDirs = ['/opt/cursor/artifacts', '/cursor/stores/self/artifacts'];
for(const dir of outDirs) {
  try { mkdirSync(dir, {recursive: true}); } catch(_err) {}
}

const VIEWPORTS = [
  {name: '1280x800', width: 1280, height: 800},
  {name: '1920x1080', width: 1920, height: 1080},
  {name: '390x844', width: 390, height: 844, touch: true}
];

function save(page, name) {
  return Promise.all(outDirs.map((dir) => page.screenshot({
    path: join(dir, name),
    fullPage: false
  })));
}

function assertThread(report, viewport) {
  const failures = [];
  const sheet = report.sheet;
  if(!sheet) failures.push('no sheet');
  else {
    if(report.overflow.left < -1) failures.push(`overflow left ${report.overflow.left}`);
    if(report.overflow.right > 1) failures.push(`overflow right ${report.overflow.right}`);
    if(report.overflow.top < -1) failures.push(`overflow top ${report.overflow.top}`);
    if(report.overflow.bottom > 1) failures.push(`overflow bottom ${report.overflow.bottom}`);
    if(sheet.top < report.pinnedBottom - 2) failures.push(`sheet top ${sheet.top} < pinned ${report.pinnedBottom}`);
    const composerTop = Math.min(report.inputTop, report.replyTop ?? report.inputTop);
    if(sheet.bottom > composerTop + 2) failures.push(`sheet bottom ${sheet.bottom} > composer ${composerTop}`);
    if(viewport.width > 925) {
      if(sheet.left < report.sidebarRight - 2) {
        failures.push(`sheet overlaps sidebar ${sheet.left} < ${report.sidebarRight}`);
      }
      if(Math.abs(sheet.right - viewport.width) > 2) {
        failures.push(`sheet right ${sheet.right} != window ${viewport.width}`);
      }
    } else {
      if(sheet.left < -1) failures.push(`sheet left ${sheet.left}`);
      if(sheet.right > viewport.width + 1) failures.push(`sheet right ${sheet.right} > window`);
    }
    if(report.hasReplyLoom === false) failures.push('missing has-reply-loom');
    if(report.bubblesOpacity > 0.01) failures.push(`bubbles still visible opacity=${report.bubblesOpacity}`);
    if((report.participants || 0) < 3) failures.push(`participants ${report.participants}`);
    if(!(report.photo && report.photo.naturalWidth >= 400)) {
      failures.push(`photo not full-res ${JSON.stringify(report.photo)}`);
    }
    if(!report.close) failures.push('missing close X');
    const nested = (report.depths || []).filter((row) => Number(row.depth) > 0);
    if(nested.length < 3) failures.push(`tree too flat ${JSON.stringify(report.depths)}`);
  }
  return failures;
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const results = [];
try {
  for(const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: {width: viewport.width, height: viewport.height},
      hasTouch: !!viewport.touch,
      isMobile: !!viewport.touch,
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/fork-layout.html?view=thread`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => {
      const report = window.__forkLayout;
      return report && report.sheet && report.sheet.height > 40;
    }, null, {timeout: 60000});
    await page.waitForFunction(() => {
      const photo = document.querySelector('[data-fork-probe="thread-photo"]');
      return photo && photo.naturalWidth >= 400;
    }, null, {timeout: 60000});
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => window.__forkLayout);
    const failures = assertThread(report, viewport);
    await save(page, `v5-thread-tree-${viewport.name}.png`);
    await save(page, `v5-thread-photo-${viewport.name}.png`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const sheet = document.querySelector('[data-fork-probe="thread-sheet"]');
      return sheet && !sheet.classList.contains('is-open');
    });
    await save(page, `v5-thread-esc-${viewport.name}.png`);
    const closed = await page.evaluate(() => {
      const sheet = document.querySelector('[data-fork-probe="thread-sheet"]');
      return {open: sheet?.classList.contains('is-open'), has: document.querySelector('.chat')?.classList.contains('has-reply-loom')};
    });
    if(closed.open || closed.has) failures.push('Esc did not close the thread');
    results.push({view: 'thread', viewport: viewport.name, failures, report: {
      sheet: report.sheet,
      participants: report.participants,
      photo: report.photo,
      depths: report.depths,
      overflow: report.overflow,
      replyTop: report.replyTop,
      inputTop: report.inputTop
    }, file: `v5-thread-tree-${viewport.name}.png`});
    await context.close();
  }

  const voiceContext = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false
  });
  const voice = await voiceContext.newPage();
  voice.setDefaultTimeout(60000);
  await voice.goto(`${base}/fork-layout.html?view=voice`, {waitUntil: 'domcontentloaded'});
  await voice.waitForSelector('.voice-score-word');
  await voice.waitForFunction(() => {
    return document.querySelector('[data-fork-feature="voice-score"]')?.getAttribute('data-aligned') === 'speech';
  }, {timeout: 60000});
  const meta = await voice.evaluate(() => window.__forkLayout);
  const persik = voice.locator('.voice-score-word').nth(meta.persikIndex);
  await persik.scrollIntoViewIfNeeded();
  await persik.click();
  await voice.waitForFunction(() => {
    const status = document.querySelector('[data-fork-probe="voice-status"]');
    return status && status.getAttribute('data-delta-ms') != null;
  });
  await voice.waitForTimeout(250);
  const status = {
    index: await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-word-index'),
    delta: Number(await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-delta-ms')),
    current: Number(await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-current-ms')),
    truth: Number(await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-truth-ms')),
    text: await voice.locator('[data-fork-probe="voice-status"]').innerText()
  };
  await save(voice, 'v5-voice-persikovye-desktop.png');

  const mobileVoice = await browser.newContext({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true
  });
  const mv = await mobileVoice.newPage();
  mv.setDefaultTimeout(60000);
  await mv.goto(`${base}/fork-layout.html?view=voice`, {waitUntil: 'domcontentloaded'});
  await mv.waitForSelector('.voice-score-word');
  await mv.waitForFunction(() => {
    return document.querySelector('[data-fork-feature="voice-score"]')?.getAttribute('data-aligned') === 'speech';
  }, {timeout: 60000});
  const mMeta = await mv.evaluate(() => window.__forkLayout);
  const mPersik = mv.locator('.voice-score-word').nth(mMeta.persikIndex);
  await mPersik.scrollIntoViewIfNeeded();
  await mPersik.tap();
  await mv.waitForFunction(() => {
    const status = document.querySelector('[data-fork-probe="voice-status"]');
    return status && status.getAttribute('data-delta-ms') != null;
  });
  await mv.waitForTimeout(250);
  const mStatus = {
    index: await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-word-index'),
    delta: Number(await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-delta-ms')),
    current: Number(await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-current-ms')),
    truth: Number(await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-truth-ms')),
    text: await mv.locator('[data-fork-probe="voice-status"]').innerText()
  };
  await save(mv, 'v5-voice-persikovye-mobile.png');

  const rozovyeEnd = meta.truth[meta.rozovyeIndex].endMs;
  const voiceFail = [status, mStatus].filter((item) => {
    return Number(item.index) !== meta.persikIndex ||
      !(item.delta < 100) ||
      item.current < rozovyeEnd - 1;
  });
  results.push({view: 'voice-desktop', status, persikIndex: meta.persikIndex, rozovyeEnd});
  results.push({view: 'voice-mobile', status: mStatus, persikIndex: mMeta.persikIndex, rozovyeEnd});

  console.log(JSON.stringify({results, voiceFail}, null, 2));
  if(results.some((item) => item.failures && item.failures.length) || voiceFail.length) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
