import {prerollMsForWord, seekIsNearOnset, seekMsForWord, VoiceScoreWord, wordIndexAtTime, WORD_ONSET_SEEK_SLACK_MS} from '@lib/forkFeatures/voiceScore/wordTimings';

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

export function seekSecondsForWord(word: VoiceScoreWord, previous?: VoiceScoreWord): number {
  return seekMsForWord(word, previous) / 1000;
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

function minAllowedSec(word: VoiceScoreWord, previous?: VoiceScoreWord): number {
  const onset = word.startMs / 1000;
  return Math.max(0, onset - prerollMsForWord(word, previous) / 1000);
}

/**
 * Seek `audio` so playback starts on the clicked word's speech onset
 * (or a ≤50ms silence preroll that does not include the previous word).
 */
export function seekAudioToWord(
  audio: SeekableAudio,
  word: VoiceScoreWord,
  previous?: VoiceScoreWord
): number {
  const durationSec = Number.isFinite(audio.duration) && (audio.duration as number) > 0 ?
    audio.duration as number :
    undefined;
  const onset = word.startMs / 1000;
  const end = Math.max(onset, word.endMs / 1000);
  const span = Math.max(0, end - onset);
  const minAllowed = minAllowedSec(word, previous);
  let seconds = toMediaSeconds(seekSecondsForWord(word, previous), durationSec);

  if(seconds < minAllowed) {
    seconds = minAllowed;
  }

  if(seconds > onset + WORD_ONSET_SEEK_SLACK_MS / 1000) {
    seconds = onset + Math.min(0.02, WORD_ONSET_SEEK_SLACK_MS / 1000 - 0.01);
  }

  if(seconds >= end && span > 0) {
    seconds = Math.max(minAllowed, onset);
  }

  let target = seconds;
  for(let i = 0; i < 8; i++) {
    audio.currentTime = target;
    if(audio.currentTime >= minAllowed - 1e-4) {
      break;
    }

    const deficit = minAllowed - audio.currentTime;
    target = Math.min(
      onset + WORD_ONSET_SEEK_SLACK_MS / 1000 - 0.005,
      target + deficit + 0.01
    );
  }

  if(audio.currentTime > onset + WORD_ONSET_SEEK_SLACK_MS / 1000 && span > WORD_ONSET_SEEK_SLACK_MS / 1000) {
    audio.currentTime = onset + 0.012;
  }

  if(previous && audio.currentTime * 1000 + 1 < previous.endMs) {
    audio.currentTime = Math.max(minAllowed, onset);
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

  const previous = index > 0 ? words[index - 1] : undefined;
  const timeSec = seekAudioToWord(audio, word, previous);
  const timeMs = timeSec * 1000;
  if(previous && timeMs + 1 < previous.endMs) {
    return false;
  }

  return wordIndexAtTime(words, Math.max(timeMs, word.startMs)) === index &&
    seekIsNearOnset(word, timeMs, WORD_ONSET_SEEK_SLACK_MS, previous) &&
    (word.endMs <= word.startMs || timeMs < word.endMs);
}
