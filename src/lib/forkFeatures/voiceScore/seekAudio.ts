import {seekMsForWord, VoiceScoreWord, wordIndexAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';

/**
 * Telegram's voice `duration` and HTMLMediaElement.currentTime are both in
 * **seconds**. Word timings are stored in milliseconds.
 */
export function durationMsFromSeconds(durationSec: number): number {
  if(!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }

  return durationSec * 1000;
}

export function seekSecondsForWord(word: VoiceScoreWord): number {
  return seekMsForWord(word) / 1000;
}

/**
 * If a caller mixed units and passed milliseconds to an API that wants seconds
 * (value far past the clip length), convert. Short clips stay in seconds.
 */
export function toMediaSeconds(value: number, durationSec?: number): number {
  if(!Number.isFinite(value) || value < 0) {
    return 0;
  }

  if(durationSec && durationSec > 0 && value > durationSec + 0.5 && value > 50) {
    return value / 1000;
  }

  return value;
}

type SeekableAudio = {
  currentTime: number,
  duration?: number,
  play?: () => unknown
};

/**
 * Seek `audio` so playback starts **inside** word N. Returns the seconds that
 * were written to `currentTime`. If the element snaps early (codec/keyframe),
 * we land further into the token rather than on the previous word's boundary.
 */
export function seekAudioToWord(audio: SeekableAudio, word: VoiceScoreWord): number {
  const durationSec = Number.isFinite(audio.duration) && (audio.duration as number) > 0 ?
    audio.duration as number :
    undefined;
  let seconds = toMediaSeconds(seekSecondsForWord(word), durationSec);
  const start = word.startMs / 1000;
  const end = word.endMs / 1000;
  const span = Math.max(0, end - start);
  if(seconds < start || seconds >= end) {
    seconds = start + span * 0.4;
  }

  audio.currentTime = seconds;
  if(audio.currentTime < start) {
    audio.currentTime = start + Math.min(0.08, Math.max(0.01, span * 0.4));
  }

  if(audio.currentTime >= end && span > 0) {
    audio.currentTime = Math.max(start, end - Math.min(0.02, span / 5));
  }

  return audio.currentTime;
}

export function clickedWordStartsInside(
  words: VoiceScoreWord[],
  index: number,
  audio: SeekableAudio
): boolean {
  const word = words[index];
  if(!word) {
    return false;
  }

  const timeSec = seekAudioToWord(audio, word);
  const timeMs = timeSec * 1000;
  return wordIndexAtTime(words, timeMs) === index &&
    timeMs >= word.startMs &&
    timeMs < word.endMs;
}
