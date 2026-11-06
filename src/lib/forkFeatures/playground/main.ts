import './playground.scss';
import {estimateWordTimings, wordClassAtTime, wordIndexAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';
import {clickedWordStartsInside, durationMsFromSeconds, seekAudioToWord} from '@lib/forkFeatures/voiceScore/seekAudio';
import {collectThreadMids, expandLinksForSeed, linksFromMessages} from '@lib/forkFeatures/replyLoom/collectThread';
import {FAN_CLOSE_TEXT, FAN_WHEEL_OPEN} from '@lib/forkFeatures/fan/overlayConstants';
import {fanPoses} from '@lib/forkFeatures/fan/collectUnread';
import {reduceFanWheel} from '@lib/forkFeatures/fan/gesture';
import {formatYearRailLabel} from '@lib/forkFeatures/yearRail/focusMessage';

document.title = 'WebK extra features';

const root = document.getElementById('root')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const node = document.createElement(tag);
  if(cls) node.className = cls;
  if(text != null) node.textContent = text;
  return node;
}

function phone(title: string, sub: string) {
  const wrap = el('div', 'pg-phone');
  const screen = el('div', 'pg-screen');
  const hdr = el('header', 'pg-hdr');
  hdr.append(el('div', 'pg-ava', title.slice(0, 1)), (() => {
    const names = el('div');
    names.append(el('b', '', title), el('div', 'pg-pv', sub));
    return names;
  })());
  const chat = el('div', 'pg-chat');
  const stream = el('div', 'pg-stream');
  chat.append(stream);
  const composer = el('div', 'pg-composer');
  composer.append(el('span', 'pg-field', 'Message'));
  screen.append(hdr, chat, composer);
  wrap.append(screen);
  return {wrap, chat, stream};
}

function bubble(side: 'in' | 'out', text: string, time: string, extra?: (bub: HTMLElement) => void) {
  const row = el('div', 'pg-row' + (side === 'out' ? ' me' : ''));
  const bub = el('div', 'pg-bub ' + side);
  extra?.(bub);
  if(text) bub.append(document.createTextNode(text));
  bub.append(el('span', 'pg-meta', time + (side === 'out' ? ' ✓✓' : '')));
  row.append(bub);
  return row;
}

function voiceScore(host: HTMLElement) {
  const spoken = 'The cabin is past the mill, not the first turn. Stay on the river road until you see the green planter, then the lockbox is under it. The code is four nine two one.';
  const durationSec = 18;
  const durationMs = durationMsFromSeconds(durationSec);
  const words = estimateWordTimings(spoken, durationMs);
  const p = phone('Maya Chen', 'online');
  host.append(p.wrap);

  const audio = {currentTime: 0, duration: durationSec};
  const voice = el('div', 'pg-vrow');
  const play = el('button', 'pg-play', '▶');
  play.type = 'button';
  voice.append(play);
  const col = el('div');
  const clock = el('div', 'pg-pv', '0:18');
  clock.dataset.forkProbe = 'voice-clock';
  col.append(clock, el('div', 'pg-meta', 'Voice Score · tap a word to jump'));
  voice.append(col);

  const status = el('div', 'pg-meta');
  status.dataset.forkProbe = 'voice-status';
  status.textContent = 'click a word';

  const body = el('div', 'audio-transcribed-text');
  const score = el('span', 'voice-score-words');
  score.dataset.forkFeature = 'voice-score';
  const buttons = words.map((word, index) => {
    const button = el('button', 'voice-score-word', word.word);
    button.type = 'button';
    button.dataset.wordIndex = String(index);
    score.append(button, document.createTextNode(word.trailing));
    return button;
  });
  body.append(score);

  p.stream.append(bubble('in', '', '6:11 PM', (bub) => {
    bub.append(voice, body, status);
  }));

  let timer = 0;
  let started = 0;
  let playing = false;

  const paint = (timeMs: number) => {
    clock.textContent = (timeMs / 1000).toFixed(2) + 's / ' + durationSec + 's';
    buttons.forEach((button, i) => {
      const cls = wordClassAtTime(words[i], timeMs);
      button.classList.toggle('voice-score-word-now', cls === 'now');
      button.classList.toggle('voice-score-word-said', cls === 'said');
    });
  };

  const tick = () => {
    const timeMs = audio.currentTime * 1000 + (playing ? performance.now() - started : 0);
    paint(timeMs);
    if(playing && timeMs < durationMs) {
      timer = requestAnimationFrame(tick);
    } else if(timeMs >= durationMs) {
      playing = false;
      play.textContent = '▶';
    }
  };

  const seek = (ms: number) => {
    audio.currentTime = ms / 1000;
    started = performance.now();
    playing = true;
    play.textContent = '❚❚';
    cancelAnimationFrame(timer);
    tick();
  };

  play.onclick = () => {
    if(playing) {
      audio.currentTime += (performance.now() - started) / 1000;
      playing = false;
      play.textContent = '▶';
      cancelAnimationFrame(timer);
      return;
    }

    seek(audio.currentTime * 1000);
  };

  buttons.forEach((button, i) => {
    button.onclick = () => {
      const inside = clickedWordStartsInside(words, i, audio);
      const t = seekAudioToWord(audio, words[i]);
      const idx = wordIndexAtTime(words, t * 1000);
      status.textContent = `word ${i} → ${t.toFixed(3)}s (index ${idx})${inside ? '' : ' FAIL'}`;
      status.dataset.wordIndex = String(idx);
      seek(t * 1000);
    };
  });

  seek(0);
}

function replyLoom(host: HTMLElement) {
  const messages = [
    {mid: 100},
    {mid: 101, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}},
    {mid: 102, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}},
    {mid: 103, reply_to_mid: 102, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 102, reply_to_top_id: 100}},
    {mid: 104, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}},
    {mid: 105, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}}
  ];
  const links = expandLinksForSeed({mid: 103, replyToMid: 102, replyToTopId: 100}, linksFromMessages(messages));
  const thread = collectThreadMids(103, links);
  const p = phone('Cabin weekend', 'Maya, Jules, Alex, Sam');
  host.append(p.wrap);
  p.chat.style.setProperty('--chat-topbar-height', '0px');
  p.chat.style.setProperty('--pinned-floating-height', '64px');
  p.chat.style.setProperty('--chat-padding-bottom', '0px');

  const pinned = el('div', 'pg-pinned');
  pinned.dataset.forkProbe = 'pinned-bar';
  pinned.append(el('b', '', 'Pinned Message'), el('span', '', 'Lockbox under the green planter'));
  p.chat.prepend(pinned);

  const copy = [
    {mid: 100, side: 'in' as const, name: 'Maya Chen', text: 'Host said the lockbox code is 4921, under the green planter.', time: '8:02 AM'},
    {mid: 101, side: 'out' as const, name: 'You', text: 'I will write it on paper in the car.', time: '8:14 AM'},
    {mid: 102, side: 'in' as const, name: 'Jules Adeyemi', text: 'Don\'t put the code in the car. I will keep it.', time: '8:28 AM'},
    {mid: 103, side: 'in' as const, name: 'Alex Park', text: 'Then text me when you are an hour out.', time: '8:41 AM'},
    {mid: 104, side: 'out' as const, name: 'You', text: 'Jules, I left the kettle by the door.', time: '8:44 AM'},
    {mid: 105, side: 'in' as const, name: 'Sam Okonkwo', text: 'I am on the 4:10. Save me a bunk.', time: '9:03 AM'}
  ];

  copy.forEach((item) => {
    const row = bubble(item.side, item.text, item.time, (bub) => {
      if(item.mid === 103) {
        const q = el('div', 'pg-quote', 'Jules Adeyemi — Don\'t put the code in the car.');
        q.dataset.forkProbe = 'quote-click';
        q.tabIndex = 0;
        bub.prepend(q);
      }
    });
    row.dataset.mid = String(item.mid);
    if(item.mid !== 100 && item.mid !== 103) row.classList.add('reply-loom-dim');
    p.stream.append(row);
  });

  const sheet = el('div', 'reply-loom-sheet is-open');
  sheet.dataset.forkFeature = 'reply-loom';
  const head = el('div', 'reply-loom-sheet-head');
  head.append(el('b', '', 'Thread'));
  const back = el('button', 'reply-loom-sheet-back', 'Back to chat');
  back.type = 'button';
  head.append(back);
  const body = el('div', 'reply-loom-sheet-body');
  body.dataset.forkProbe = 'thread-body';
  copy.filter((item) => thread.includes(item.mid)).forEach((item) => {
    const row = el('div', 'reply-loom-row' + (item.side === 'out' ? ' is-out' : ''));
    row.dataset.mid = String(item.mid);
    const bub = el('div', 'reply-loom-bubble' + (item.side === 'out' ? ' is-out' : ''));
    bub.append(el('span', 'reply-loom-sender', item.name), el('div', 'reply-loom-text', item.text), el('span', 'reply-loom-meta', item.time));
    row.append(bub);
    body.append(row);
  });
  sheet.append(head, body);
  p.chat.append(sheet);

  back.onclick = () => {
    sheet.classList.remove('is-open');
    p.stream.querySelectorAll('.reply-loom-dim').forEach((node) => node.classList.remove('reply-loom-dim'));
  };
}

function fan(host: HTMLElement) {
  const people = [
    ['M', '#e07a5f', 'Maya Chen', 'The code is in the voice message.', '3'],
    ['J', '#3d7a74', 'Jules Adeyemi', 'The cake has to stay flat.', '1'],
    ['C', '#5b7c99', 'Cabin weekend', 'Jules: I packed the kettle.', '8'],
    ['S', '#c46b4a', 'Sam Okonkwo', 'Are you on the 4:10?', '2']
  ];
  const extra = ['Ada', 'Ben', 'Cleo', 'Drew', 'Eve', 'Finn', 'Gia', 'Hank', 'Ivy', 'Jon', 'Kim', 'Leo', 'Mo', 'Nia', 'Oli', 'Pip', 'Quinn', 'Rae', 'Sky', 'Tess', 'Uma', 'Val', 'Wes', 'Xan', 'Yara', 'Zed'];
  const p = phone('Chats', '4 unread');
  host.append(p.wrap);
  p.stream.classList.add('scrollable', 'scrollable-y');
  p.stream.dataset.forkProbe = 'fan-list';

  const probe = el('div', 'pg-probe');
  probe.dataset.forkProbe = 'fan-wheel';
  probe.textContent = 'scrollTop 0 · blocked no · open no';
  p.wrap.prepend(probe);

  people.forEach((person) => {
    const row = el('div', 'pg-dlg');
    const av = el('div', 'pg-ava', person[0]);
    av.style.background = person[1];
    const main = el('div');
    main.style.flex = '1';
    const top = el('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.append(el('span', 'pg-nm', person[2]), el('span', 'fan-card-badge', person[4]));
    main.append(top, el('div', 'pg-pv', person[3]));
    row.append(av, main);
    p.stream.append(row);
  });
  extra.forEach((name, i) => {
    const row = el('div', 'pg-dlg');
    const av = el('div', 'pg-ava', name[0]);
    av.style.background = '#8d969e';
    const main = el('div');
    main.append(el('span', 'pg-nm', name), el('div', 'pg-pv', 'read · row ' + (i + 5)));
    row.append(av, main);
    p.stream.append(row);
  });

  const veil = el('div', 'fan-veil');
  const stage = el('div', 'fan-stage');
  stage.dataset.forkFeature = 'fan';
  const close = el('button', 'fan-close', FAN_CLOSE_TEXT);
  close.type = 'button';
  close.dataset.forkAction = 'fan-close';
  const openFan = () => {
    veil.classList.add('is-open');
    stage.classList.add('is-open');
  };
  const closeFan = () => {
    veil.classList.remove('is-open');
    stage.classList.remove('is-open');
  };
  close.onclick = closeFan;
  stage.append(close);
  const poses = fanPoses(people.length);
  people.forEach((person, index) => {
    const card = el('button', 'fan-card');
    card.type = 'button';
    card.style.setProperty('--fan-x', poses[index].x + 'px');
    card.style.setProperty('--fan-y', poses[index].y + 'px');
    card.style.setProperty('--fan-r', poses[index].r + 'deg');
    card.style.setProperty('--fan-i', String(index));
    const av = el('div', 'fan-card-avatar');
    const a = el('div', 'pg-ava', person[0]);
    a.style.background = person[1];
    av.append(a);
    const copy = el('div', 'fan-card-copy');
    copy.append(el('b', '', person[2]), el('p', '', person[3]));
    card.append(av, copy, el('span', 'fan-card-badge', person[4]));
    card.onclick = closeFan;
    stage.append(card);
  });
  p.chat.append(veil, stage);
  openFan();

  let wheel = {accum: 0, blocked: false};
  p.stream.addEventListener('wheel', (event) => {
    if(stage.classList.contains('is-open')) {
      return;
    }

    const next = reduceFanWheel(wheel, {scrollTop: p.stream.scrollTop, deltaY: event.deltaY}, FAN_WHEEL_OPEN);
    wheel = {accum: next.accum, blocked: next.blocked};
    probe.textContent = `scrollTop ${p.stream.scrollTop | 0} · blocked ${next.blocked ? 'yes' : 'no'} · open ${next.open ? 'yes' : 'no'} · accum ${next.accum | 0}`;
    if(next.open) {
      openFan();
      wheel = {accum: 0, blocked: false};
    }
  }, {passive: true});
}

function yearRail(host: HTMLElement) {
  const items = [
    {date: 'May 18, 2024', stamp: Date.UTC(2024, 4, 18) / 1000, text: 'The lake again. You promised June and it is May.', photo: '/fork-playground-media/lake.jpg'},
    {date: 'November 2, 2024', stamp: Date.UTC(2024, 10, 2) / 1000, text: 'The plum cake survived. Barely.', photo: '/fork-playground-media/cake.jpg'},
    {date: 'August 16, 2026', stamp: Date.UTC(2026, 7, 16) / 1000, text: 'Smoke in the chimney. Press play.', video: '/fork-playground-media/cabin.mp4'}
  ];
  const p = phone('Maya Chen', 'last seen today');
  host.append(p.wrap);

  items.forEach((item) => {
    p.stream.append(el('div', 'pg-date', item.date));
    p.stream.append(bubble('in', item.text, '10:22 AM', (bub) => {
      if(item.photo) {
        const img = el('img', 'pg-photo') as HTMLImageElement;
        img.src = item.photo;
        bub.prepend(img);
      }
      if(item.video) {
        const vid = el('video', 'pg-clip') as HTMLVideoElement;
        vid.src = item.video;
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        bub.prepend(vid);
      }
    }));
  });

  const loupe = el('div', 'year-rail-loupe is-open');
  loupe.dataset.forkFeature = 'year-rail';
  const label = el('div', 'year-rail-loupe-k', formatYearRailLabel(items[2].stamp));
  const text = el('p', '', items[2].text);
  const media = el('div', 'year-rail-loupe-media');
  const vid = el('video') as HTMLVideoElement;
  vid.src = items[2].video!;
  vid.muted = true;
  vid.loop = true;
  vid.playsInline = true;
  media.append(vid);
  loupe.append(label, text, media);
  p.chat.append(loupe);
  vid.play()?.catch(() => {});

  let i = 2;
  p.stream.addEventListener('scroll', () => {
    const next = p.stream.scrollTop < 80 ? 0 : p.stream.scrollTop < 220 ? 1 : 2;
    if(next === i) return;
    i = next;
    label.textContent = formatYearRailLabel(items[i].stamp);
    text.textContent = items[i].text;
    media.replaceChildren();
    if(items[i].photo) {
      const img = el('img') as HTMLImageElement;
      img.src = items[i].photo!;
      media.append(img);
    }
    if(items[i].video) {
      const clip = el('video') as HTMLVideoElement;
      clip.src = items[i].video!;
      clip.muted = true;
      clip.loop = true;
      clip.playsInline = true;
      media.append(clip);
      clip.play()?.catch(() => {});
    }
  });
}

const demos = [voiceScore, replyLoom, fan, yearRail];
const names = ['1  Voice Score', '2  Reply Loom', '3  Fan', '4  Year Rail'];

const nav = el('div', 'pg-nav');
const stage = el('div', 'pg-stage');
const hint = el('p', 'pg-hint', 'These four screens use the same timing, thread-walk, fan layout and date-label code as the live WebK client. Sign in at / for the real chats.');

let current = 0;
function play(n: number) {
  current = n;
  [...nav.querySelectorAll('button')].forEach((button, i) => button.classList.toggle('on', i === n));
  stage.replaceChildren();
  demos[n](stage);
}

names.forEach((name, i) => {
  const button = el('button', i === 0 ? 'on' : '', name);
  button.type = 'button';
  button.onclick = () => play(i);
  nav.append(button);
});

const replay = el('button', '', 'Replay');
replay.type = 'button';
replay.onclick = () => play(current);
nav.append(replay);

root.append(nav, hint, stage);
const fromQuery = Math.max(0, Math.min(3, (+new URLSearchParams(location.search).get('f') || 1) - 1));
play(fromQuery);

window.addEventListener('keydown', (event) => {
  if(event.key >= '1' && event.key <= '4') play(+event.key - 1);
  if(event.key === 'r' || event.key === 'R') play(current);
});
