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
    if(sheet.bottom > report.inputTop + 2) failures.push(`sheet bottom ${sheet.bottom} > input ${report.inputTop}`);
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
    if(report.back) {
      if(report.back.right > sheet.right + 2) failures.push(`back button overflows sheet ${report.back.right} > ${sheet.right}`);
      if(report.back.left < sheet.left - 2) failures.push(`back button left of sheet ${report.back.left} < ${sheet.left}`);
    }
    for(const bubble of report.outBubbles || []) {
      if(bubble.right > sheet.right + 2) failures.push(`out bubble overflows sheet ${bubble.right} > ${sheet.right} (${bubble.text})`);
      if(bubble.textRight > sheet.right + 2) failures.push(`out bubble text overflows sheet ${bubble.textRight} > ${sheet.right} (${bubble.text})`);
    }
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
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => window.__forkLayout);
    const failures = assertThread(report, viewport);
    const file = `v4-thread-fit-${viewport.name}.png`;
    await save(page, file);
    results.push({view: 'thread', viewport: viewport.name, failures, report, file});
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
  }, null, {timeout: 60000});
  const meta = await voice.evaluate(() => window.__forkLayout);
  const oni = voice.locator('.voice-score-word').nth(meta.oniIndex);
  await oni.scrollIntoViewIfNeeded();
  await oni.click();
  await voice.waitForFunction(() => {
    const status = document.querySelector('[data-fork-probe="voice-status"]');
    return status && status.getAttribute('data-delta-ms') != null;
  });
  await voice.waitForTimeout(200);
  const status = {
    index: await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-word-index'),
    delta: Number(await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-delta-ms')),
    current: Number(await voice.locator('[data-fork-probe="voice-status"]').getAttribute('data-current-ms')),
    text: await voice.locator('[data-fork-probe="voice-status"]').innerText()
  };
  await save(voice, 'v4-voice-oni-onset-desktop.png');

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
  }, null, {timeout: 60000});
  const mMeta = await mv.evaluate(() => window.__forkLayout);
  const mOni = mv.locator('.voice-score-word').nth(mMeta.oniIndex);
  await mOni.scrollIntoViewIfNeeded();
  await mOni.tap();
  await mv.waitForFunction(() => {
    const status = document.querySelector('[data-fork-probe="voice-status"]');
    return status && status.getAttribute('data-delta-ms') != null;
  });
  await mv.waitForTimeout(200);
  const mStatus = {
    index: await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-word-index'),
    delta: Number(await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-delta-ms')),
    current: Number(await mv.locator('[data-fork-probe="voice-status"]').getAttribute('data-current-ms')),
    text: await mv.locator('[data-fork-probe="voice-status"]').innerText()
  };
  await save(mv, 'v4-voice-oni-onset-mobile.png');

  results.push({view: 'voice-desktop', status, onset2Ms: meta.onset2Ms, oniIndex: meta.oniIndex});
  results.push({view: 'voice-mobile', status: mStatus, onset2Ms: mMeta.onset2Ms, oniIndex: mMeta.oniIndex});

  const voiceFail = [status, mStatus].filter((item) => !(item.delta < 100) || Number(item.index) !== meta.oniIndex);
  console.log(JSON.stringify({results, voiceFail}, null, 2));
  if(results.some((item) => item.failures && item.failures.length) || voiceFail.length) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
