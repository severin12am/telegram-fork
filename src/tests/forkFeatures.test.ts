import {estimateWordTimings, seekMsForWord, wordClassAtTime, wordIndexAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';
import {clickedWordStartsInside, durationMsFromSeconds, seekAudioToWord, seekSecondsForWord, toMediaSeconds} from '@lib/forkFeatures/voiceScore/seekAudio';
import {collectThreadMids, expandLinksForSeed, findThreadRoot, getReplyToMid, linksFromMessages, messageHasReplyChain} from '@lib/forkFeatures/replyLoom/collectThread';
import {fanPoses} from '@lib/forkFeatures/fan/collectUnread';
import {FAN_CLOSE_TEXT, FAN_WHEEL_OPEN} from '@lib/forkFeatures/fan/overlayConstants';
import {listIsAtTop, reduceFanWheel} from '@lib/forkFeatures/fan/gesture';
import {formatYearRailLabel, pickFocusBubble, shouldShowYearRail} from '@lib/forkFeatures/yearRail/focusMessage';
import {FORK_FEATURE_DEFAULTS, isForkFeatureEnabled, setForkFeatureEnabled} from '@lib/forkFeatures/flags';

describe('Voice Score timings', () => {
  test('longer words take a larger share and the last mark ends at the duration', () => {
    const words = estimateWordTimings('The cabin is past', 1000);
    expect(words.map((word) => word.word)).toEqual(['The', 'cabin', 'is', 'past']);
    expect(words[0].startMs).toBe(0);
    expect(words[words.length - 1].endMs).toBeCloseTo(1000, 5);
    expect(words[1].endMs - words[1].startMs).toBeGreaterThan(words[2].endMs - words[2].startMs);
  });

  test('empty text yields no marks', () => {
    expect(estimateWordTimings('   ', 800)).toEqual([]);
  });

  test('the current word is the one that contains the playhead', () => {
    const words = estimateWordTimings('one two three', 300);
    const now = words[1].startMs + 1;
    expect(wordClassAtTime(words[0], now)).toBe('said');
    expect(wordClassAtTime(words[1], now)).toBe('now');
    expect(wordClassAtTime(words[2], now)).toBe('');
    expect(wordIndexAtTime(words, now)).toBe(1);
  });

  test('tapping a word seeks inside that word, not onto the previous token', () => {
    const words = estimateWordTimings('one two three', 3000);
    for(let i = 0; i < words.length; i++) {
      const seek = seekMsForWord(words[i]);
      expect(wordIndexAtTime(words, seek)).toBe(i);
      expect(wordClassAtTime(words[i], seek)).toBe('now');
      if(i > 0) {
        expect(seek).toBeGreaterThan(words[i - 1].endMs - 1e-6);
        expect(wordClassAtTime(words[i - 1], seek)).toBe('said');
      }
    }
  });

  test('duration helpers keep seconds and milliseconds distinct', () => {
    expect(durationMsFromSeconds(12.5)).toBe(12500);
    expect(durationMsFromSeconds(0)).toBe(0);
    expect(toMediaSeconds(4.2, 18)).toBeCloseTo(4.2);
    expect(toMediaSeconds(4200, 18)).toBeCloseTo(4.2);
  });

  test('clicking word N starts playback within word N', () => {
    const text = 'alpha bravo charlie delta echo';
    const durationSec = 10;
    const words = estimateWordTimings(text, durationMsFromSeconds(durationSec));
    const audio = {currentTime: 0, duration: durationSec};
    expect(words.length).toBe(5);
    for(let n = 0; n < words.length; n++) {
      expect(clickedWordStartsInside(words, n, audio)).toBe(true);
      const t = audio.currentTime;
      expect(t).toBeGreaterThanOrEqual(words[n].startMs / 1000);
      expect(t).toBeLessThan(words[n].endMs / 1000);
      expect(wordIndexAtTime(words, t * 1000)).toBe(n);
      if(n > 0) {
        expect(t).toBeGreaterThanOrEqual(words[n - 1].endMs / 1000);
      }
    }
  });

  test('a codec snap before the word start is pushed back inside the word', () => {
    const words = estimateWordTimings('one two three four', 8000);
    const word = words[2];
    const audio = {
      _time: 0,
      duration: 8,
      set currentTime(value: number) {
        this._time = Math.max(0, value - 0.05);
      },
      get currentTime() {
        return this._time;
      }
    };
    const t = seekAudioToWord(audio, word);
    expect(t).toBeGreaterThanOrEqual(word.startMs / 1000);
    expect(t).toBeLessThan(word.endMs / 1000);
    expect(wordIndexAtTime(words, t * 1000)).toBe(2);
  });

  test('seekSecondsForWord is currentTime units (seconds), not milliseconds', () => {
    const words = estimateWordTimings('one two three', 6000);
    const seconds = seekSecondsForWord(words[1]);
    expect(seconds).toBeLessThan(6);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds * 1000).toBeCloseTo(seekMsForWord(words[1]), 5);
  });
});

describe('Reply Loom thread walk', () => {
  test('walks up to the root and then lists every descendant', () => {
    const links = [
      {mid: 10},
      {mid: 11, replyToMid: 10},
      {mid: 12, replyToMid: 10},
      {mid: 13, replyToMid: 12},
      {mid: 99}
    ];

    expect(findThreadRoot(13, new Map(links.map((link) => [link.mid, link])))).toBe(10);
    expect(collectThreadMids(13, links)).toEqual([10, 11, 12, 13]);
  });

  test('a message with no replies is its own thread', () => {
    expect(collectThreadMids(7, [{mid: 7}])).toEqual([7]);
  });

  test('reads reply_to_mid first, then reply_to_msg_id from a messageReplyHeader', () => {
    expect(getReplyToMid({reply_to_mid: 77, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 42}})).toBe(77);
    expect(getReplyToMid({reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 42}})).toBe(42);
    expect(getReplyToMid({reply_to: {_: 'messageReplyStoryHeader'}})).toBeUndefined();
  });

  test('a 3+ participant group chain with branches lists the whole tree', () => {
    const messages = [
      {mid: 100},
      {mid: 101, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}},
      {mid: 102, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}},
      {mid: 103, reply_to_mid: 102, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 102, reply_to_top_id: 100}},
      {mid: 104, reply_to_mid: 101, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 101, reply_to_top_id: 100}},
      {mid: 105, reply_to_mid: 100, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 100, reply_to_top_id: 100}},
      {mid: 200, reply_to_mid: 199}
    ];
    const links = expandLinksForSeed({mid: 103, replyToMid: 102, replyToTopId: 100}, linksFromMessages(messages));
    expect(collectThreadMids(103, links)).toEqual([100, 101, 102, 103, 104, 105]);
    expect(collectThreadMids(104, links)).toEqual([100, 101, 102, 103, 104, 105]);
  });

  test('Thread is only for messages that sit on a reply chain', () => {
    const links = [
      {mid: 10},
      {mid: 11, replyToMid: 10},
      {mid: 99}
    ];
    expect(messageHasReplyChain({mid: 10}, links)).toBe(true);
    expect(messageHasReplyChain({mid: 11, reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 10}}, links)).toBe(true);
    expect(messageHasReplyChain({mid: 99}, links)).toBe(false);
    expect(messageHasReplyChain({mid: 7, replies: {replies: 3}}, [])).toBe(true);
  });
});

describe('Fan layout', () => {
  test('fans cards around a center line', () => {
    const poses = fanPoses(4);
    expect(poses).toHaveLength(4);
    expect(poses[0].r).toBeLessThan(0);
    expect(poses[3].r).toBeGreaterThan(0);
    expect(poses[3].y).toBeGreaterThan(poses[0].y);
  });

  test('close button copy is Close all, not an i18n key', () => {
    expect(FAN_CLOSE_TEXT).toBe('Close all');
    expect(FAN_CLOSE_TEXT).not.toContain('ForkFeatures');
  });

  test('wheel open is only overscroll at scrollTop 0, never mid-list', () => {
    expect(listIsAtTop(0)).toBe(true);
    expect(listIsAtTop(12)).toBe(false);

    const midList = reduceFanWheel({accum: 0, blocked: false}, {scrollTop: 800, deltaY: -120});
    expect(midList.open).toBe(false);
    expect(midList.blocked).toBe(true);
    expect(midList.accum).toBe(0);

    const leftover = reduceFanWheel(midList, {scrollTop: 0, deltaY: -200});
    expect(leftover.open).toBe(false);
    expect(leftover.blocked).toBe(true);

    const released = reduceFanWheel(leftover, {scrollTop: 0, deltaY: 10});
    expect(released.blocked).toBe(false);

    let atTop = reduceFanWheel(released, {scrollTop: 0, deltaY: -200});
    expect(atTop.open).toBe(false);
    atTop = reduceFanWheel(atTop, {scrollTop: 0, deltaY: -(FAN_WHEEL_OPEN)});
    expect(atTop.open).toBe(true);
  });
});

describe('Year Rail', () => {
  test('labels a unix timestamp as month + year', () => {
    expect(formatYearRailLabel(Date.UTC(2024, 4, 18) / 1000)).toMatch(/2024/);
  });

  test('picks the bubble nearest the loupe rest position', () => {
    const viewport = {top: 0, height: 100, bottom: 100} as DOMRect;
    const far = {getBoundingClientRect: () => ({top: 80, height: 20, bottom: 100})} as HTMLElement;
    const near = {getBoundingClientRect: () => ({top: 10, height: 20, bottom: 30})} as HTMLElement;
    expect(pickFocusBubble([far, near], viewport, 0.22)).toBe(near);
  });

  test('stays hidden on a short chat or when idle at the bottom', () => {
    expect(shouldShowYearRail({
      isScrolling: true,
      scrollTop: 10,
      scrollHeight: 200,
      clientHeight: 180,
      lastDirection: -1
    })).toBe(false);

    expect(shouldShowYearRail({
      isScrolling: true,
      scrollTop: 400,
      scrollHeight: 2000,
      clientHeight: 600,
      lastDirection: -1
    })).toBe(true);
  });
});

describe('feature flags', () => {
  test('default to on and honour localStorage', () => {
    localStorage.removeItem('tweb-fork-features');
    expect(isForkFeatureEnabled('voiceScore')).toBe(FORK_FEATURE_DEFAULTS.voiceScore);
    setForkFeatureEnabled('voiceScore', false);
    expect(isForkFeatureEnabled('voiceScore')).toBe(false);
    setForkFeatureEnabled('voiceScore', true);
  });
});
