import '../../../scss/style.scss';
import {createComponent, render} from 'solid-js/web';
import updateColumnWidths, {installColumnWidthsUpdater} from '@helpers/updateColumnWidths';
import {layoutReplyLoomSheet, sheetOverflowVsViewport} from '@lib/forkFeatures/replyLoom/fitSheet';
import {openReplyLoom} from '@lib/forkFeatures/replyLoom/sheet';
import VoiceScoreWords from '@lib/forkFeatures/voiceScore/VoiceScoreWords';
import {makePauseWav, pauseWavUrl} from '@lib/forkFeatures/voiceScore/pauseWav';
import {RUSSIAN_VOICE_TRANSCRIPT, SECOND_ONI_INDEX} from '@lib/forkFeatures/layoutTest/transcript';

document.documentElement.classList.add('night');
document.body.classList.add('animation-level-2', 'night');
document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}

function syncChrome() {
  const mobile = window.innerWidth <= 600;
  document.body.classList.toggle('is-left-column-shown', !mobile);
  document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');
  updateColumnWidths();
}

syncChrome();
installColumnWidthsUpdater();
window.addEventListener('resize', syncChrome);

const columnLeft = document.getElementById('column-left')!;
const columnCenter = document.getElementById('column-center')!;

const leftHead = el('div', 'sidebar-header');
leftHead.append(el('div', 'sidebar-header__title', 'Chats'));
const leftList = el('div', 'chatlist');
['Playtest.icernees', 'The Экономист', 'Israel Exposed', 'BMS CRYPTO CHAT'].forEach((name) => {
  const row = el('div', 'ListItem');
  row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:10px 12px;color:var(--primary-text-color)';
  const av = el('div', '');
  av.style.cssText = 'width:46px;height:46px;border-radius:50%;background:#3d4a5c;flex:none';
  row.append(av, el('div', '', name));
  leftList.append(row);
});
columnLeft.append(leftHead, leftList);

const chatsContainer = el('div', 'chats-container tabs-container');
chatsContainer.dataset.animation = 'navigation';
const chat = el('div', 'chat tabs-tab active');
chat.style.background = '#0e1621';
chatsContainer.append(chat);
columnCenter.append(chatsContainer);

const topbar = el('div', 'sidebar-header topbar');
topbar.style.display = 'flex';
const info = el('div', 'chat-info');
info.append(el('div', 'user-title', 'Playtest.icernees'));
info.append(el('div', 'info', '24 members, 2 online'));
topbar.append(info);
chat.append(topbar);

const plates = el('div', 'topbar-floating-plates');
const pinned = el('div', 'pinned-container pinned-message');
pinned.dataset.forkProbe = 'pinned-bar';
const pinnedWrap = el('div', 'pinned-container-wrapper');
pinnedWrap.append(
  el('div', '', 'Pinned Message'),
  el('div', '', 'https://telemost.yandex.ru/j/00241015807397?skip_app=1 https://ru.otmorozki.fun/')
);
pinned.append(pinnedWrap);
plates.append(pinned);
topbar.append(plates);
chat.style.setProperty('--pinned-floating-height', '56px');

const bubbles = el('div', 'bubbles scrolled-down');
const chatInner = el('div', 'bubbles-inner');
bubbles.append(chatInner);
chat.append(bubbles);

const viewport = el('div', 'bubbles-viewport');
chat.append(viewport);

const input = el('div', 'chat-input chat-input-main');
const inputContainer = el('div', 'chat-input-container chat-input-main-container');
const plate = el('div', 'chat-input-wrapper');
plate.textContent = 'Message';
plate.style.cssText = 'padding:12px 16px;color:var(--secondary-text-color)';
inputContainer.append(plate);
input.append(inputContainer);
chat.append(input);

type FakeMessage = {
  _: 'message',
  mid: number,
  peerId: number,
  fromId: number,
  date: number,
  message: string,
  pFlags: {out?: true},
  reply_to_mid?: number,
  reply_to?: {_: 'messageReplyHeader', reply_to_msg_id: number, reply_to_top_id: number},
  __senderName: string
};

const thread: FakeMessage[] = [
  {_: 'message', mid: 100, peerId: 1, fromId: 11, date: 1710000000, message: 'Host said the lockbox code is 4921, under the green planter.', pFlags: {}, __senderName: 'Maya Chen'},
  {_: 'message', mid: 101, peerId: 1, fromId: 1, date: 1710000600, message: 'I will write it on paper in the car.', pFlags: {out: true}, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}, __senderName: 'You'},
  {_: 'message', mid: 102, peerId: 1, fromId: 12, date: 1710001200, message: 'Don\'t put the code in the car. I will keep it.', pFlags: {}, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}, __senderName: 'Jules Adeyemi'},
  {_: 'message', mid: 103, peerId: 1, fromId: 13, date: 1710001800, message: 'Then text me when you are an hour out.', pFlags: {}, reply_to_mid: 102, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 102, reply_to_top_id: 100}, __senderName: 'Alex Park'},
  {_: 'message', mid: 104, peerId: 1, fromId: 1, date: 1710002100, message: 'Jules, I left the kettle by the door.', pFlags: {out: true}, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}, __senderName: 'You'},
  {_: 'message', mid: 105, peerId: 1, fromId: 14, date: 1710002700, message: 'I am on the 4:10. Save me a bunk.', pFlags: {}, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}, __senderName: 'Sam Okonkwo'}
];

const byMid = new Map(thread.map((message) => [message.mid, message]));

for(const message of thread) {
  const bubble = el('div', 'bubble' + (message.pFlags.out ? ' is-out' : ' is-in'));
  bubble.dataset.mid = String(message.mid);
  bubble.style.cssText = 'max-width:78%;margin:6px 10px;padding:8px 10px;border-radius:12px;background:var(--surface-color);color:var(--primary-text-color)';
  bubble.append(el('div', '', message.__senderName + ': ' + message.message));
  chatInner.append(bubble);
}

const view = new URLSearchParams(location.search).get('view') || 'thread';
const seed = byMid.get(103)!;
const wav = makePauseWav({word1Ms: 900, gapMs: 700, word2Ms: 1600});
const voiceRow = el('div', 'audio audio-voice') as HTMLElement & {audio?: HTMLMediaElement};
const audio = el('audio') as HTMLAudioElement;
audio.preload = 'auto';
audio.src = pauseWavUrl(wav);
voiceRow.audio = audio;
const wordsHost = el('div');
wordsHost.dataset.forkProbe = 'voice-words';
const voiceStatus = el('div', '');
voiceStatus.dataset.forkProbe = 'voice-status';
voiceStatus.textContent = 'click Они';

if(view === 'voice') {
  const voiceBubble = el('div', 'bubble is-in');
  voiceBubble.style.cssText = 'max-width:min(420px, 92%);margin:12px 10px;padding:12px 14px;border-radius:16px;background:var(--surface-color);color:var(--primary-text-color)';
  voiceBubble.dataset.forkProbe = 'voice-bubble';
  voiceRow.append(audio, wordsHost);
  voiceBubble.append(voiceRow, voiceStatus);
  chatInner.replaceChildren(voiceBubble);
  render(() => createComponent(VoiceScoreWords, {
    text: RUSSIAN_VOICE_TRANSCRIPT,
    durationSec: wav.durationMs / 1000,
    row: () => voiceRow
  }), wordsHost);
} else {
  openReplyLoom({
    container: bubbles,
    chatInner,
    chat: {
      peerId: 1 as PeerId,
      getMessage: (mid: number) => byMid.get(mid),
      input: {
        initMessageReply: () => {},
        getChatInputReplyToFromMessage: () => ({replyToMsgId: seed.mid})
      }
    }
  } as any, seed as any);
}

const probe = el('div', '');
probe.dataset.forkProbe = 'layout-probe';
probe.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;padding:6px 10px;border-radius:8px;background:#111;color:#fff;font:12px/1.3 ui-monospace,monospace;max-width:70vw';
document.body.append(probe);

function measure() {
  const sheet = document.querySelector<HTMLElement>('.reply-loom-sheet');
  if(sheet) {
    layoutReplyLoomSheet(sheet, chat);
  }

  const sheetBox = sheet?.getBoundingClientRect();
  const bubblesBox = bubbles.getBoundingClientRect();
  const topbarBox = topbar.getBoundingClientRect();
  const pinnedBox = plates.getBoundingClientRect();
  const inputBox = input.getBoundingClientRect();
  const leftBox = columnLeft.getBoundingClientRect();
  const overflow = sheet ? sheetOverflowVsViewport(sheet, {width: window.innerWidth, height: window.innerHeight}) : {left: 0, right: 0, top: 0, bottom: 0};
  const bubblesStyle = getComputedStyle(bubbles);
  const backEl = sheet?.querySelector<HTMLElement>('.reply-loom-sheet-back');
  const backBox = backEl?.getBoundingClientRect();
  const report = {
    viewport: {width: window.innerWidth, height: window.innerHeight},
    sidebarRight: leftBox.right,
    bubbles: {left: bubblesBox.left, right: bubblesBox.right, top: bubblesBox.top, bottom: bubblesBox.bottom, width: bubblesBox.width},
    bubblesOpacity: Number(bubblesStyle.opacity),
    hasReplyLoom: chat.classList.contains('has-reply-loom'),
    topbarBottom: topbarBox.bottom,
    pinnedBottom: pinnedBox.bottom,
    inputTop: inputBox.top,
    sheet: sheetBox ? {left: sheetBox.left, right: sheetBox.right, top: sheetBox.top, bottom: sheetBox.bottom, width: sheetBox.width, height: sheetBox.height} : null,
    back: backBox && backEl ? {left: backBox.left, right: backBox.right, top: backBox.top, bottom: backBox.bottom, text: backEl.textContent} : null,
    outBubbles: Array.from(document.querySelectorAll<HTMLElement>('.reply-loom-bubble.is-out')).map((node) => {
      const box = node.getBoundingClientRect();
      const textBox = node.querySelector('.reply-loom-text')?.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        textRight: textBox?.right ?? box.right,
        text: node.innerText.replace(/\s+/g, ' ').slice(0, 80)
      };
    }),
    overflow,
    onset2Ms: wav.onset2Ms,
    oniIndex: SECOND_ONI_INDEX
  };
  probe.textContent = `${report.viewport.width}×${report.viewport.height} sheet ${sheetBox ? `${Math.round(sheetBox.left)},${Math.round(sheetBox.top)} ${Math.round(sheetBox.width)}×${Math.round(sheetBox.height)}` : 'none'} overflow L${overflow.left.toFixed(0)} R${overflow.right.toFixed(0)} T${overflow.top.toFixed(0)} B${overflow.bottom.toFixed(0)}`;
  (window as any).__forkLayout = report;
  return report;
}

if(view === 'voice') {
  voiceRow.addEventListener('click', (event) => {
    const audioEl = voiceRow.audio;
    if(!audioEl) {
      return;
    }

    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>('.voice-score-word');
    if(!button) {
      return;
    }

    const startMs = Number(button.dataset.startMs || 0);
    const index = Number(button.dataset.wordIndex || -1);
    const stamp = () => {
      const t = audioEl.currentTime;
      const delta = Math.abs(t * 1000 - startMs);
      voiceStatus.textContent = `word ${index} ${button.textContent} → ${t.toFixed(3)}s onset ${startMs}ms Δ${delta.toFixed(0)}ms`;
      voiceStatus.dataset.wordIndex = String(index);
      voiceStatus.dataset.deltaMs = String(Math.round(delta));
      voiceStatus.dataset.currentMs = String(Math.round(t * 1000));
    };

    audioEl.addEventListener('seeked', stamp, {once: true});
    queueMicrotask(stamp);
    setTimeout(stamp, 80);
  }, true);
}

window.addEventListener('resize', () => requestAnimationFrame(measure));
requestAnimationFrame(() => {
  measure();
  requestAnimationFrame(measure);
});
audio.addEventListener('loadedmetadata', () => measure());
