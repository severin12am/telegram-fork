import {seekIsNearOnset, seekMsForWord, VoiceScoreWord, wordIndexAtTime, WORD_ONSET_SEEK_SLACK_MS} from '@lib/forkFeatures/voiceScore/wordTimings';

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
 * Seek `audio` so playback starts at the clicked word's own speech onset
 * (plus a few milliseconds so an opus packet snap cannot fall earlier).
 */
export function seekAudioToWord(audio: SeekableAudio, word: VoiceScoreWord): number {
  const durationSec = Number.isFinite(audio.duration) && (audio.duration as number) > 0 ?
    audio.duration as number :
    undefined;
  const start = word.startMs / 1000;
  const end = Math.max(start, word.endMs / 1000);
  const span = Math.max(0, end - start);
  let seconds = toMediaSeconds(seekSecondsForWord(word), durationSec);

  if(seconds < start) {
    seconds = start + Math.min(0.02, Math.max(0.008, span * 0.02));
  }

  if(seconds > start + WORD_ONSET_SEEK_SLACK_MS / 1000) {
    seconds = start + Math.min(0.04, WORD_ONSET_SEEK_SLACK_MS / 1000 - 0.01);
  }

  if(seconds >= end && span > 0) {
    seconds = Math.max(start, end - Math.min(0.02, span / 5));
  }

  let target = seconds;
  for(let i = 0; i < 8; i++) {
    audio.currentTime = target;
    if(audio.currentTime >= start) {
      break;
    }

    const deficit = start - audio.currentTime;
    target = Math.min(
      start + WORD_ONSET_SEEK_SLACK_MS / 1000 - 0.005,
      target + deficit + 0.01
    );
  }

  if(audio.currentTime > start + WORD_ONSET_SEEK_SLACK_MS / 1000 && span > WORD_ONSET_SEEK_SLACK_MS / 1000) {
    audio.currentTime = start + 0.04;
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
    seekIsNearOnset(word, timeMs) &&
    timeMs >= word.startMs &&
    (word.endMs <= word.startMs || timeMs < word.endMs);
}
