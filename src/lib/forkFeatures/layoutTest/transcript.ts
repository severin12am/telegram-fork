import {tokenizeTranscript} from '@lib/forkFeatures/voiceScore/wordTimings';

export const RUSSIAN_VOICE_TRANSCRIPT =
  'Почему второе и третье они черного цвета? Они вот это, которые типа розовые, персиковые, они прикольные.';

export const PAUSE_WORDS_TRANSCRIPT = 'цвета Они';

export const SECOND_ONI_INDEX = tokenizeTranscript(RUSSIAN_VOICE_TRANSCRIPT)
  .findIndex((token, index) => token.word.replace(/[^\p{L}]/gu, '') === 'Они' && index > 0);
