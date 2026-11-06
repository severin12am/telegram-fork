export type VoiceScoreWord = {
  word: string,
  startMs: number,
  endMs: number,
  trailing: string
};

const TOKEN_RE = /(\S+)(\s*)/g;

/**
 * Telegram's `messages.transcribeAudio` returns plain text — no word timestamps.
 * Voice Score therefore spreads the transcript across the voice duration the
 * same way the concept demo does: longer tokens take a larger share, then the
 * whole sequence is scaled to the real clip length.
 */
export function estimateWordTimings(text: string, durationMs: number): VoiceScoreWord[] {
  const tokens: Array<{word: string, trailing: string, weight: number}> = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while((match = TOKEN_RE.exec(text))) {
    tokens.push({
      word: match[1],
      trailing: match[2] || '',
      weight: 180 + match[1].length * 46
    });
  }

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
 * Seek target for a tapped word. HTMLMediaElement rounds `currentTime`, and
 * `startMs` is also the previous token's `endMs`, so seeking to the boundary
 * plays the previous word. Land a little way into this token instead.
 */
export function seekMsForWord(word: VoiceScoreWord): number {
  const span = Math.max(0, word.endMs - word.startMs);
  if(span <= 0) {
    return Math.max(0, word.startMs);
  }

  const inward = Math.min(40, Math.max(12, span * 0.1));
  return Math.min(word.startMs + inward, word.endMs - Math.min(6, span / 5));
}
