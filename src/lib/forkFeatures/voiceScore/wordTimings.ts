export type VoiceScoreWord = {
  word: string,
  startMs: number,
  endMs: number,
  trailing: string
};

export type TranscriptToken = {
  word: string,
  trailing: string,
  weight: number
};

const TOKEN_RE = /(\S+)(\s*)/g;

/** A seek may sit this far after the word's speech onset, never before it except preroll. */
export const WORD_ONSET_SEEK_SLACK_MS = 100;
/** Silence before the onset, never into the previous word. */
export const WORD_PREROLL_MS = 50;

export function tokenizeTranscript(text: string): TranscriptToken[] {
  const tokens: TranscriptToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while((match = TOKEN_RE.exec(text))) {
    tokens.push({
      word: match[1],
      trailing: match[2] || '',
      weight: 180 + match[1].length * 46
    });
  }

  return tokens;
}

/**
 * Telegram's `messages.transcribeAudio` returns plain text — no word timestamps.
 * This even spread is only a fallback when the audio itself cannot be read.
 * Prefer `alignWordsToSpeech`, which places tokens on detected speech onsets.
 */
export function estimateWordTimings(text: string, durationMs: number): VoiceScoreWord[] {
  const tokens = tokenizeTranscript(text);
  if(!tokens.length) {
    return [];
  }

  const rawTotal = tokens.reduce((sum, token) => sum + token.weight, 0);
  const total = Math.max(1, durationMs);
  let cursor = 0;
  return tokens.map((token) => {
    const span = (token.weight / rawTotal) * total;
    const startMs = cursor;
    const endMs = cursor + span;
    cursor = endMs;
    return {
      word: token.word,
      trailing: token.trailing,
      startMs,
      endMs
    };
  });
}

export function wordClassAtTime(word: VoiceScoreWord, timeMs: number): 'now' | 'said' | '' {
  if(timeMs < 0 || timeMs < word.startMs) {
    return '';
  }

  // Half-open [start, end) so the playhead at a boundary belongs to the next word.
  if(timeMs < word.endMs) {
    return 'now';
  }

  return 'said';
}

export function wordIndexAtTime(words: VoiceScoreWord[], timeMs: number): number {
  if(!words.length) {
    return -1;
  }

  for(let i = 0; i < words.length; i++) {
    if(timeMs < words[i].endMs) {
      return i;
    }
  }

  return words.length - 1;
}

export function prerollMsForWord(word: VoiceScoreWord, previous?: VoiceScoreWord): number {
  const onset = Math.max(0, word.startMs);
  if(!previous) {
    return 0;
  }

  const floor = Math.max(0, previous.endMs);
  const room = Math.max(0, onset - floor);
  return Math.min(WORD_PREROLL_MS, room);
}

/**
 * Seek target for a tapped word, in milliseconds.
 *
 * Land on the word's own speech onset. A tiny preroll (≤50ms) is allowed only
 * in the silence after the previous word — never on that previous token.
 */
export function seekMsForWord(word: VoiceScoreWord, previous?: VoiceScoreWord): number {
  const onset = Math.max(0, word.startMs);
  const preroll = prerollMsForWord(word, previous);
  if(preroll >= 8) {
    return onset - preroll;
  }

  const end = Math.max(onset, word.endMs);
  const span = end - onset;
  if(!(span > 0)) {
    return onset;
  }

  const epsilon = Math.min(16, Math.max(6, span * 0.015), WORD_ONSET_SEEK_SLACK_MS - 1, Math.max(1, span - 1));
  return Math.min(onset + epsilon, end - Math.min(1, span / 4));
}

export function seekIsNearOnset(
  word: VoiceScoreWord,
  timeMs: number,
  slackMs = WORD_ONSET_SEEK_SLACK_MS,
  previous?: VoiceScoreWord
): boolean {
  const preroll = prerollMsForWord(word, previous);
  if(timeMs + 1 < word.startMs - preroll) {
    return false;
  }

  if(previous && timeMs + 1 < previous.endMs) {
    return false;
  }

  if(timeMs > word.startMs + slackMs) {
    return false;
  }

  if(word.endMs > word.startMs && timeMs >= word.endMs) {
    return false;
  }

  return true;
}
