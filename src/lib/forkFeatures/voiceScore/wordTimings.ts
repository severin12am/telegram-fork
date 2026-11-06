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

/** A seek may sit this far after the word's speech onset, never before it. */
export const WORD_ONSET_SEEK_SLACK_MS = 100;

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

/**
 * Seek target for a tapped word, in milliseconds.
 *
 * Use the word's own start (the speech onset). HTMLMediaElement.currentTime is
 * seconds and opus/ogg voice notes snap to packet boundaries (~20ms), so land
 * a few milliseconds into the token — still within 100ms of the onset, never
 * on the previous word and never 40% into this one.
 */
export function seekMsForWord(word: VoiceScoreWord): number {
  const start = Math.max(0, word.startMs);
  const end = Math.max(start, word.endMs);
  const span = end - start;
  if(!(span > 0)) {
    return start;
  }

  const epsilon = Math.min(40, Math.max(12, span * 0.02), WORD_ONSET_SEEK_SLACK_MS - 1, Math.max(1, span - 1));
  return Math.min(start + epsilon, end - Math.min(1, span / 4));
}

export function seekIsNearOnset(
  word: VoiceScoreWord,
  timeMs: number,
  slackMs = WORD_ONSET_SEEK_SLACK_MS
): boolean {
  if(timeMs + 1 < word.startMs) {
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
