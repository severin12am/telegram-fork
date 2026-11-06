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

/**
 * Seek `audio` to the clicked word's start on the same map the highlighter uses.
 */
export function seekAudioToWord(
  audio: SeekableAudio,
  word: VoiceScoreWord,
  previous?: VoiceScoreWord
): number {
  const durationSec = Number.isFinite(audio.duration) && (audio.duration as number) > 0 ?
    audio.duration as number :
    undefined;
  const onset = Math.max(0, word.startMs / 1000);
  const minAllowed = Math.max(0, onset - prerollMsForWord(word, previous) / 1000);
  let seconds = toMediaSeconds(seekSecondsForWord(word, previous), durationSec);

  if(seconds < minAllowed) {
    seconds = minAllowed;
  }

  if(previous && seconds * 1000 + 1 < previous.endMs) {
    seconds = onset;
  }

  if(seconds > onset + WORD_ONSET_SEEK_SLACK_MS / 1000) {
    seconds = onset;
  }

  let target = seconds;
  for(let i = 0; i < 10; i++) {
    audio.currentTime = target;
    if(audio.currentTime >= minAllowed - 1e-4) {
      break;
    }

    const deficit = minAllowed - audio.currentTime;
    target = Math.min(onset + WORD_ONSET_SEEK_SLACK_MS / 1000, target + deficit + 0.012);
  }

  if(previous && audio.currentTime * 1000 + 1 < previous.endMs) {
    audio.currentTime = onset;
  }

  if(audio.currentTime + 0.12 < onset && onset - audio.currentTime < 0.25) {
    audio.currentTime = onset;
  }

  if(audio.currentTime > onset + 0.06) {
    audio.currentTime = onset;
    if(audio.currentTime > onset + 0.06) {
      audio.currentTime = Math.max(minAllowed, onset - 0.04);
    }
  }

  if(durationSec && durationSec > 0.4 && audio.currentTime > durationSec - 0.12 && onset < durationSec - 0.25) {
    audio.currentTime = onset;
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
