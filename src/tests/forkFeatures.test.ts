import {estimateWordTimings, wordClassAtTime, wordIndexAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';
import {collectThreadMids, findThreadRoot, getReplyToMid} from '@lib/forkFeatures/replyLoom/collectThread';
import {fanPoses} from '@lib/forkFeatures/fan/collectUnread';
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

  test('reads reply_to_msg_id from a messageReplyHeader', () => {
    expect(getReplyToMid({reply_to: {_: 'messageReplyHeader', reply_to_msg_id: 42}})).toBe(42);
    expect(getReplyToMid({reply_to: {_: 'messageReplyStoryHeader'}})).toBeUndefined();
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
