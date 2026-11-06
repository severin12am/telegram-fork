import '../../../scss/style.scss';
import {createComponent, render} from 'solid-js/web';
import updateColumnWidths, {installColumnWidthsUpdater} from '@helpers/updateColumnWidths';
import {layoutReplyLoomSheet, sheetOverflowVsViewport} from '@lib/forkFeatures/replyLoom/fitSheet';
import {openReplyLoom} from '@lib/forkFeatures/replyLoom/sheet';
import VoiceScoreWords from '@lib/forkFeatures/voiceScore/VoiceScoreWords';
import {
  PERSKOVYE_INDEX,
  ROZOVYE_INDEX,
  RUSSIAN_VOICE_TRANSCRIPT,
  SECOND_ONI_INDEX
} from '@lib/forkFeatures/layoutTest/transcript';
import voiceOnsets from './media/russian-voice-onsets.json';
import voiceUrl from './media/russian-voice.wav?url';
import fullPhotoUrl from './media/full-photo.jpg?url';
import thumbUrl from './media/full-photo-thumb.jpg?url';

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
['Playtest IceHoles', 'The Экономист', 'Israel Exposed', 'BMS CRYPTO CHAT'].forEach((name) => {
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
info.append(el('div', 'user-title', 'Playtest IceHoles'));
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
const replyBar = el('div', 'reply-wrapper');
replyBar.dataset.forkProbe = 'reply-bar';
replyBar.style.cssText = 'display:flex;align-items:center;gap:10px;height:0;overflow:hidden;padding:0 12px;box-sizing:border-box;background:var(--surface-color);color:var(--primary-text-color)';
const replyMark = el('div', '');
replyMark.style.cssText = 'width:3px;height:36px;border-radius:2px;background:var(--primary-color);flex:none';
const replyCopy = el('div', '');
replyCopy.append(el('b', '', 'Reply to Ilia'), el('div', '', 'Photo'));
replyBar.append(replyMark, replyCopy);

const inputContainer = el('div', 'chat-input-container chat-input-main-container');
const plate = el('div', 'chat-input-wrapper');
plate.textContent = 'Message';
plate.style.cssText = 'padding:12px 16px;color:var(--secondary-text-color)';
inputContainer.append(plate);
input.append(replyBar, inputContainer);
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
  __senderName: string,
  media?: {
    _: 'messageMediaPhoto',
    photo: {_:'photo', id: string, w: number, h: number, sizes: Array<{_: 'photoSize', type: string, w: number, h: number, size: number}>}
  },
  __fullMediaUrl?: string,
  __mediaWidth?: number,
  __mediaHeight?: number
};

const thread: FakeMessage[] = [
  {
    _: 'message',
    mid: 100,
    peerId: 1,
    fromId: 11,
    date: 1710000000,
    message: '',
    pFlags: {},
    __senderName: 'Ilia',
    media: {
      _: 'messageMediaPhoto',
      photo: {
        _: 'photo',
        id: 'photo-full',
        w: 1280,
        h: 720,
        sizes: [
          {_: 'photoSize', type: 's', w: 40, h: 40, size: 400},
          {_: 'photoSize', type: 'x', w: 800, h: 450, size: 80000},
          {_: 'photoSize', type: 'y', w: 1280, h: 720, size: 180000}
        ]
      }
    },
    __fullMediaUrl: fullPhotoUrl,
    __mediaWidth: 1280,
    __mediaHeight: 720
  },
  {_: 'message', mid: 101, peerId: 1, fromId: 1, date: 1710000600, message: 'Нет, если это крысавпн! https://t.me/krisaVPN_bot?start=i7Z78KsH', pFlags: {out: true}, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}, __senderName: 'You'},
  {_: 'message', mid: 102, peerId: 1, fromId: 12, date: 1710001200, message: 'That JPEG is the lockbox photo. Keep the original, not the thumb.', pFlags: {}, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}, __senderName: 'Патимат Гатиева'},
  {_: 'message', mid: 103, peerId: 1, fromId: 13, date: 1710001800, message: 'I will print it before we leave.', pFlags: {}, reply_to_mid: 102, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 102, reply_to_top_id: 100}, __senderName: 'Maya Chen'},
  {_: 'message', mid: 104, peerId: 1, fromId: 1, date: 1710002100, message: 'Maya, take the spare key too.', pFlags: {out: true}, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}, __senderName: 'You'},
  {_: 'message', mid: 105, peerId: 1, fromId: 14, date: 1710002700, message: 'On the 4:10. Save me a bunk.', pFlags: {}, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}, __senderName: 'Jules Adeyemi'}
];

const byMid = new Map(thread.map((message) => [message.mid, message]));

for(const message of thread) {
  const bubble = el('div', 'bubble' + (message.pFlags.out ? ' is-out' : ' is-in'));
  bubble.dataset.mid = String(message.mid);
  bubble.style.cssText = 'max-width:78%;margin:6px 10px;padding:8px 10px;border-radius:12px;background:var(--surface-color);color:var(--primary-text-color)';
  bubble.append(el('div', '', message.__senderName + (message.message ? ': ' + message.message : '')));
  if(message.__fullMediaUrl) {
    const thumb = el('img');
    thumb.src = thumbUrl;
    thumb.alt = 'thumb';
    thumb.width = 40;
    thumb.height = 40;
    thumb.style.cssText = 'display:block;width:40px;height:40px;image-rendering:pixelated;border-radius:6px;margin-top:6px';
    thumb.dataset.forkProbe = 'chat-thumb';
    bubble.append(thumb);
  }
  chatInner.append(bubble);
}

const view = new URLSearchParams(location.search).get('view') || 'thread';
const seed = byMid.get(103)!;
const voiceRow = el('div', 'audio audio-voice') as HTMLElement & {audio?: HTMLMediaElement};
const audio = el('audio') as HTMLAudioElement;
audio.preload = 'auto';
audio.src = voiceUrl;
voiceRow.audio = audio;
const wordsHost = el('div');
wordsHost.dataset.forkProbe = 'voice-words';
const voiceStatus = el('div', '');
voiceStatus.dataset.forkProbe = 'voice-status';
voiceStatus.textContent = 'click персиковые';

function armReplyBar() {
  chat.classList.add('is-helper-active');
  replyBar.style.height = '52px';
  replyBar.style.padding = '8px 12px';
}

if(view === 'voice') {
  const voiceBubble = el('div', 'bubble is-in reply-loom-bubble');
  voiceBubble.style.cssText = 'max-width:min(520px, 92%);margin:16px 12px;padding:12px 14px;border-radius:16px;background:var(--message-background-color, #182533);color:var(--primary-text-color, #e4ecf2)';
  voiceBubble.dataset.forkProbe = 'voice-bubble';
  wordsHost.style.cssText = 'font-size:16px;line-height:1.45;color:inherit';
  voiceStatus.style.cssText = 'margin:8px 12px 0;font:12px/1.35 ui-monospace,monospace;color:#8b9bab';
  voiceRow.append(audio, wordsHost);
  voiceBubble.append(voiceRow);
  chatInner.replaceChildren(voiceBubble, voiceStatus);
  render(() => createComponent(VoiceScoreWords, {
    text: RUSSIAN_VOICE_TRANSCRIPT,
    durationSec: (voiceOnsets.durationMs as number) / 1000,
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
        initMessageReply: () => {
          armReplyBar();
        },
        getChatInputReplyToFromMessage: () => ({replyToMsgId: seed.mid})
      }
    }
  } as any, seed as any);
  armReplyBar();
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
  const replyBox = replyBar.getBoundingClientRect();
  const leftBox = columnLeft.getBoundingClientRect();
  const overflow = sheet ? sheetOverflowVsViewport(sheet, {width: window.innerWidth, height: window.innerHeight}) : {left: 0, right: 0, top: 0, bottom: 0};
  const bubblesStyle = getComputedStyle(bubbles);
  const closeEl = sheet?.querySelector<HTMLElement>('[data-fork-probe="thread-close"]');
  const photo = sheet?.querySelector<HTMLImageElement>('[data-fork-probe="thread-photo"]');
  const quotes = Array.from(document.querySelectorAll('[data-fork-probe="thread-quote"]')).map((node) => node.textContent);
  const people = sheet?.querySelector<HTMLElement>('.reply-loom-sheet-sub')?.dataset.participants;
  const depths = Array.from(document.querySelectorAll<HTMLElement>('.reply-loom-row')).map((node) => ({
    mid: node.dataset.mid,
    depth: node.dataset.depth,
    replyTo: node.dataset.replyTo || '',
    name: node.querySelector('.reply-loom-sender')?.textContent || ''
  }));
  const report = {
    viewport: {width: window.innerWidth, height: window.innerHeight},
    sidebarRight: leftBox.right,
    bubbles: {left: bubblesBox.left, right: bubblesBox.right, top: bubblesBox.top, bottom: bubblesBox.bottom, width: bubblesBox.width},
    bubblesOpacity: Number(bubblesStyle.opacity),
    hasReplyLoom: chat.classList.contains('has-reply-loom'),
    sheetOpen: !!sheet?.classList.contains('is-open'),
    topbarBottom: topbarBox.bottom,
    pinnedBottom: pinnedBox.bottom,
    inputTop: inputBox.top,
    replyTop: replyBox.height > 4 ? replyBox.top : inputBox.top,
    replyHeight: replyBox.height,
    sheet: sheetBox ? {left: sheetBox.left, right: sheetBox.right, top: sheetBox.top, bottom: sheetBox.bottom, width: sheetBox.width, height: sheetBox.height} : null,
    close: closeEl ? closeEl.getBoundingClientRect() : null,
    photo: photo ? {naturalWidth: photo.naturalWidth, naturalHeight: photo.naturalHeight, src: photo.currentSrc || photo.src} : null,
    quotes,
    participants: Number(people || 0),
    depths,
    overflow,
    persikIndex: PERSKOVYE_INDEX,
    rozovyeIndex: ROZOVYE_INDEX,
    oniIndex: SECOND_ONI_INDEX,
    truth: voiceOnsets.words
  };
  const photoNote = report.photo ? ` photo ${report.photo.naturalWidth}x${report.photo.naturalHeight}` : '';
  probe.textContent = `${report.viewport.width}×${report.viewport.height} sheet ${sheetBox ? `${Math.round(sheetBox.left)},${Math.round(sheetBox.top)} ${Math.round(sheetBox.width)}×${Math.round(sheetBox.height)}` : 'none'} overflow L${overflow.left.toFixed(0)} R${overflow.right.toFixed(0)} T${overflow.top.toFixed(0)} B${overflow.bottom.toFixed(0)}${photoNote}`;
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
    const truth = (voiceOnsets.words as Array<{startMs: number, word: string}>)[index];
    const stamp = () => {
      const t = audioEl.currentTime;
      const alignedDelta = Math.abs(t * 1000 - startMs);
      const truthDelta = truth ? Math.abs(t * 1000 - truth.startMs) : alignedDelta;
      voiceStatus.textContent = `word ${index} ${button.textContent} → ${t.toFixed(3)}s aligned ${startMs}ms truth ${truth?.startMs ?? '?'} Δ${truthDelta.toFixed(0)}ms`;
      voiceStatus.dataset.wordIndex = String(index);
      voiceStatus.dataset.deltaMs = String(Math.round(truthDelta));
      voiceStatus.dataset.alignedDeltaMs = String(Math.round(alignedDelta));
      voiceStatus.dataset.currentMs = String(Math.round(t * 1000));
      voiceStatus.dataset.truthMs = String(Math.round(truth?.startMs ?? startMs));
    };

    audioEl.addEventListener('seeked', stamp, {once: true});
    queueMicrotask(stamp);
    setTimeout(stamp, 80);
    setTimeout(stamp, 180);
  }, true);
}

window.addEventListener('resize', () => requestAnimationFrame(measure));
requestAnimationFrame(() => {
  measure();
  requestAnimationFrame(measure);
});
audio.addEventListener('loadedmetadata', () => measure());
const photoEl = () => document.querySelector<HTMLImageElement>('[data-fork-probe="thread-photo"]');
const waitPhoto = photoEl();
if(waitPhoto) {
  if(waitPhoto.complete) measure();
  else waitPhoto.addEventListener('load', () => measure());
}
setTimeout(measure, 400);
setTimeout(measure, 900);
