import {estimateWordTimings, tokenizeTranscript, VoiceScoreWord} from '@lib/forkFeatures/voiceScore/wordTimings';

export type SpeechRegion = {
  startMs: number,
  endMs: number
};

export type PcmClip = {
  samples: Float32Array,
  sampleRate: number,
  durationMs: number
};

export const SPEECH_FRAME_MS = 10;
export const MIN_GAP_MS = 140;
export const MIN_SPEECH_MS = 50;

export function rmsFrames(samples: Float32Array, sampleRate: number, frameMs = SPEECH_FRAME_MS): Float32Array {
  const frameSize = Math.max(1, Math.round(sampleRate * frameMs / 1000));
  const count = Math.max(1, Math.ceil(samples.length / frameSize));
  const rms = new Float32Array(count);
  for(let i = 0; i < count; i++) {
    const start = i * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    for(let j = start; j < end; j++) {
      const s = samples[j];
      sum += s * s;
    }
    rms[i] = Math.sqrt(sum / Math.max(1, end - start));
  }

  return rms;
}

export function speechThreshold(rms: Float32Array): number {
  if(!rms.length) {
    return 0.01;
  }

  const sorted = Array.from(rms).sort((a, b) => a - b);
  const noise = sorted[Math.floor((sorted.length - 1) * 0.2)] || 0;
  const peak = sorted[sorted.length - 1] || 0;
  return Math.max(noise * 3.5, peak * 0.08, 0.012);
}

function closeShortHoles(mask: boolean[], maxHole: number): boolean[] {
  const filled = mask.slice();
  let i = 0;
  while(i < filled.length) {
    if(filled[i]) {
      i++;
      continue;
    }

    const start = i;
    while(i < filled.length && !filled[i]) {
      i++;
    }

    const hole = i - start;
    if(start > 0 && i < filled.length && hole <= maxHole) {
      for(let k = start; k < i; k++) {
        filled[k] = true;
      }
    }
  }

  return filled;
}

export function speechRegionsFromRms(
  rms: Float32Array,
  frameMs = SPEECH_FRAME_MS,
  minGapMs = MIN_GAP_MS,
  minSpeechMs = MIN_SPEECH_MS
): SpeechRegion[] {
  const threshold = speechThreshold(rms);
  const raw = Array.from(rms, (value) => value >= threshold);
  const mask = closeShortHoles(raw, Math.round(minGapMs / frameMs));
  const minFrames = Math.max(1, Math.round(minSpeechMs / frameMs));
  const regions: SpeechRegion[] = [];
  let i = 0;
  while(i < mask.length) {
    if(!mask[i]) {
      i++;
      continue;
    }

    const start = i;
    while(i < mask.length && mask[i]) {
      i++;
    }

    if(i - start >= minFrames) {
      regions.push({
        startMs: start * frameMs,
        endMs: i * frameMs
      });
    }
  }

  return regions;
}

export function detectSpeechRegions(samples: Float32Array, sampleRate: number): SpeechRegion[] {
  if(!samples.length || !(sampleRate > 0)) {
    return [];
  }

  return speechRegionsFromRms(rmsFrames(samples, sampleRate));
}

export function firstSpeechOnsetMs(
  samples: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number
): number | undefined {
  const regions = detectSpeechRegions(samples, sampleRate);
  for(const region of regions) {
    if(region.endMs <= fromMs) {
      continue;
    }

    const onset = Math.max(region.startMs, fromMs);
    if(onset < toMs) {
      return onset;
    }
  }

  return undefined;
}

function splitUtterances(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  for(const part of parts) {
    const trimmed = part.trim();
    if(trimmed) {
      out.push(trimmed);
    }
  }

  return out.length ? out : (text.trim() ? [text] : []);
}

function interpolateTokens(
  tokens: Array<{word: string, trailing: string, weight: number}>,
  startMs: number,
  endMs: number
): VoiceScoreWord[] {
  const total = Math.max(1, endMs - startMs);
  const rawTotal = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  let cursor = startMs;
  return tokens.map((token, index) => {
    const span = (token.weight / rawTotal) * total;
    const start = cursor;
    const end = index === tokens.length - 1 ? endMs : cursor + span;
    cursor = end;
    return {
      word: token.word,
      trailing: token.trailing,
      startMs: start,
      endMs: end
    };
  });
}

function assignGroupsToRegions<T>(groups: T[], regions: SpeechRegion[]): Array<{group: T[], region: SpeechRegion}> {
  const out: Array<{group: T[], region: SpeechRegion}> = [];
  let index = 0;
  for(let r = 0; r < regions.length; r++) {
    const leftGroups = groups.length - index;
    const leftRegions = regions.length - r;
    const take = r === regions.length - 1 ?
      leftGroups :
      Math.max(0, Math.min(leftGroups - (leftRegions - 1), Math.max(1, Math.floor(leftGroups / leftRegions))));
    out.push({
      group: groups.slice(index, index + take),
      region: regions[r]
    });
    index += take;
  }

  return out;
}

function snapStartsOutOfSilence(words: VoiceScoreWord[], regions: SpeechRegion[]): VoiceScoreWord[] {
  if(!words.length) {
    return words;
  }

  const aligned = words.map((word) => ({...word}));
  let prevEnd = 0;
  for(let i = 0; i < aligned.length; i++) {
    const word = aligned[i];
    const searchFrom = Math.max(prevEnd, word.startMs);
    let onset = Math.max(word.startMs, searchFrom);
    for(const region of regions) {
      if(region.endMs <= searchFrom) {
        continue;
      }

      onset = Math.max(region.startMs, searchFrom);
      break;
    }

    word.startMs = onset;
    if(i > 0) {
      aligned[i - 1].endMs = Math.max(aligned[i - 1].startMs, onset);
    }

    prevEnd = onset;
  }

  const last = aligned[aligned.length - 1];
  if(last && last.endMs < last.startMs) {
    last.endMs = last.startMs;
  }

  return aligned;
}

/**
 * Put each transcript token on real speech, not on the silence between
 * utterances. Telegram's transcription has no per-word times, so evenly
 * spreading by character count lands a click inside the previous word or in
 * the pause before it. Speech regions (energy) are the clock; punctuation
 * only helps group tokens onto those regions.
 */
export function alignWordsToSpeech(
  text: string,
  durationMs: number,
  samples?: Float32Array,
  sampleRate?: number
): VoiceScoreWord[] {
  const fallback = estimateWordTimings(text, durationMs);
  if(!samples || !sampleRate || !fallback.length) {
    return fallback;
  }

  const regions = detectSpeechRegions(samples, sampleRate)
    .map((region) => ({
      startMs: Math.max(0, region.startMs),
      endMs: Math.min(durationMs || region.endMs, region.endMs)
    }))
    .filter((region) => region.endMs - region.startMs >= MIN_SPEECH_MS);

  if(!regions.length) {
    return fallback;
  }

  const utterances = splitUtterances(text);
  const utteranceTokens = utterances.map((utterance) => tokenizeTranscript(utterance)).filter((tokens) => tokens.length);
  const allTokens = tokenizeTranscript(text);
  if(!allTokens.length) {
    return fallback;
  }

  const packed: VoiceScoreWord[] = [];
  if(utteranceTokens.length >= regions.length) {
    for(const {group, region} of assignGroupsToRegions(utteranceTokens, regions)) {
      const tokens = group.flat();
      if(!tokens.length) {
        continue;
      }

      packed.push(...interpolateTokens(tokens, region.startMs, region.endMs));
    }
  } else {
    let tokenIndex = 0;
    for(let r = 0; r < regions.length; r++) {
      const region = regions[r];
      const leftTokens = allTokens.length - tokenIndex;
      const leftRegions = regions.length - r;
      const take = r === regions.length - 1 ?
        leftTokens :
        Math.max(1, Math.min(leftTokens - (leftRegions - 1), Math.round(leftTokens * (
          (region.endMs - region.startMs) /
          Math.max(1, regions.slice(r).reduce((sum, item) => sum + (item.endMs - item.startMs), 0))
        ))));
      const slice = allTokens.slice(tokenIndex, tokenIndex + Math.max(1, take));
      tokenIndex += slice.length;
      packed.push(...interpolateTokens(slice, region.startMs, region.endMs));
    }
  }

  if(packed.length !== allTokens.length) {
    return snapStartsOutOfSilence(fallback, regions);
  }

  return snapStartsOutOfSilence(packed, regions);
}

const pcmCache = new Map<string, Promise<PcmClip | undefined>>();

function mixdown(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  if(channels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const out = new Float32Array(length);
  for(let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for(let i = 0; i < length; i++) {
      out[i] += data[i] / channels;
    }
  }

  return out;
}

export async function decodeMediaPcm(audio: HTMLMediaElement | undefined): Promise<PcmClip | undefined> {
  if(!audio) {
    return undefined;
  }

  const src = audio.currentSrc || audio.src;
  if(!src) {
    return undefined;
  }

  const cached = pcmCache.get(src);
  if(cached) {
    return cached;
  }

  const pending = (async() => {
    try {
      const response = await fetch(src);
      if(!response.ok) {
        return undefined;
      }

      const bytes = await response.arrayBuffer();
      const Ctx = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if(!Ctx) {
        return undefined;
      }

      const ctx = new Ctx();
      try {
        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        const samples = mixdown(decoded);
        return {
          samples,
          sampleRate: decoded.sampleRate,
          durationMs: (decoded.duration || samples.length / decoded.sampleRate) * 1000
        };
      } finally {
        await ctx.close().catch(() => {});
      }
    } catch(_err) {
      return undefined;
    }
  })();

  pcmCache.set(src, pending);
  return pending;
}
