import {estimateWordTimings, SNAP_WINDOW_MS, tokenizeTranscript, VoiceScoreWord} from '@lib/forkFeatures/voiceScore/wordTimings';

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
/** Merge stop-consonant holes, never a comma / word-gap pause. */
export const HOLE_FILL_MS = 50;
export const MIN_SPEECH_MS = 40;
/** Ignore syllable-internal wobble; keep comma / word-gap dips. */
export const ONSET_DIP_MS = 70;
export const MIN_ONSET_GAP_MS = 80;
export const MIN_GAP_MS = 80;

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

export function speechMaskFromRms(
  rms: Float32Array,
  frameMs = SPEECH_FRAME_MS,
  holeFillMs = HOLE_FILL_MS
): boolean[] {
  const threshold = speechThreshold(rms);
  const raw = Array.from(rms, (value) => value >= threshold);
  return closeShortHoles(raw, Math.max(1, Math.round(holeFillMs / frameMs)));
}

export function speechRegionsFromRms(
  rms: Float32Array,
  frameMs = SPEECH_FRAME_MS,
  holeFillMs = HOLE_FILL_MS,
  minSpeechMs = MIN_SPEECH_MS
): SpeechRegion[] {
  const mask = speechMaskFromRms(rms, frameMs, holeFillMs);
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
  const onsets = detectWordOnsets(samples, sampleRate);
  for(const onset of onsets) {
    if(onset >= fromMs && onset < toMs) {
      return onset;
    }
  }

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

/**
 * Rising edges after a short energy dip: one onset per spoken token, including
 * words that share a burst ("розовые, персиковые") when a comma only dips
 * 40–120 ms.
 */
export function detectWordOnsets(samples: Float32Array, sampleRate: number): number[] {
  if(!samples.length || !(sampleRate > 0)) {
    return [];
  }

  const frameMs = SPEECH_FRAME_MS;
  const rms = rmsFrames(samples, sampleRate, frameMs);
  const threshold = speechThreshold(rms);
  const raw = Array.from(rms, (value) => value >= threshold);
  const mask = closeShortHoles(raw, Math.max(1, Math.round(HOLE_FILL_MS / frameMs)));
  const dipFrames = Math.max(2, Math.round(ONSET_DIP_MS / frameMs));
  const onsets: number[] = [];

  const push = (timeMs: number) => {
    if(timeMs < 0) {
      return;
    }

    if(!onsets.length || timeMs - onsets[onsets.length - 1] >= MIN_ONSET_GAP_MS) {
      onsets.push(timeMs);
    }
  };

  let below = dipFrames;
  for(let i = 0; i < mask.length; i++) {
    if(!mask[i]) {
      below++;
      continue;
    }

    if(below >= dipFrames) {
      push(i * frameMs);
    }

    below = 0;
  }

  return onsets;
}

export function trailingSilenceMs(
  rms: Float32Array,
  frameMs: number,
  durationMs: number
): number {
  if(!rms.length) {
    return 0;
  }

  const threshold = Math.max(speechThreshold(rms) * 0.35, 0.006);
  let i = rms.length - 1;
  while(i > 0 && rms[i] < threshold) {
    i--;
  }

  const spokenEnd = (i + 1) * frameMs;
  const tail = Math.max(0, durationMs - spokenEnd);
  return tail >= 180 ? tail : 0;
}

export function proportionalStarts(
  tokens: Array<{weight: number}>,
  durationMs: number
): number[] {
  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  const total = Math.max(1, durationMs);
  let cursor = 0;
  return tokens.map((token) => {
    const start = cursor;
    cursor += (token.weight / totalWeight) * total;
    return start;
  });
}

/**
 * Syllable weights along the speech-only timeline (silence has no weight).
 * Amplitude is ignored so a loud syllable cannot steal time from a quiet one.
 * Tokens are never packed into whole regions — each start is independent.
 */
export function expectedStartsFromEnergy(
  tokens: Array<{weight: number}>,
  rms: Float32Array,
  frameMs: number,
  durationMs: number
): number[] {
  const mask = speechMaskFromRms(rms, frameMs);
  const speech: number[] = [];
  for(let i = 0; i < mask.length; i++) {
    if(mask[i]) {
      speech.push(i);
    }
  }

  if(!speech.length) {
    return proportionalStarts(tokens, durationMs);
  }

  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  let acc = 0;
  return tokens.map((token) => {
    const pos = Math.min(speech.length - 1, Math.floor((acc / totalWeight) * speech.length));
    acc += token.weight;
    return Math.min(durationMs, speech[pos] * frameMs);
  });
}

export function snapToNearestOnset(
  expected: number,
  onsets: number[],
  windowMs = SNAP_WINDOW_MS,
  floorMs = -Infinity
): number {
  let best: number | undefined;
  let bestDist = Infinity;
  for(const onset of onsets) {
    if(onset < floorMs) {
      continue;
    }

    const dist = Math.abs(onset - expected);
    if(dist > windowMs + SPEECH_FRAME_MS) {
      continue;
    }

    if(dist < bestDist - 0.5 || (Math.abs(dist - bestDist) <= 0.5 && (best === undefined || onset > best))) {
      best = onset;
      bestDist = dist;
    }
  }

  return best === undefined ? Math.max(expected, floorMs === -Infinity ? 0 : floorMs) : best;
}

function mergeOnsets(values: number[], durationMs: number): number[] {
  const unique = Array.from(new Set(
    values
      .map((value) => Math.max(0, Math.min(durationMs, value)))
      .filter((value) => Number.isFinite(value))
  )).sort((a, b) => a - b);
  const merged: number[] = [];
  for(const value of unique) {
    if(!merged.length || value - merged[merged.length - 1] >= MIN_ONSET_GAP_MS) {
      merged.push(value);
    }
  }

  return merged;
}

/**
 * One map for highlight and seek. Place tokens by syllable weight across the
 * real media duration, then locally snap each start to the nearest energy
 * onset within ±250 ms. Extra onsets are never uniquely assigned — a token
 * never jumps a whole segment to consume them.
 */
export function alignWordsToSpeech(
  text: string,
  durationMs: number,
  samples?: Float32Array,
  sampleRate?: number
): VoiceScoreWord[] {
  const tokens = tokenizeTranscript(text);
  if(!tokens.length) {
    return [];
  }

  const duration = Math.max(1, durationMs);
  const fallback = estimateWordTimings(text, duration);
  if(!samples || !sampleRate) {
    return fallback;
  }

  const regions = detectSpeechRegions(samples, sampleRate);
  const onsets = mergeOnsets(
    [
      ...detectWordOnsets(samples, sampleRate),
      ...regions.map((region) => region.startMs)
    ],
    duration
  );
  const rms = rmsFrames(samples, sampleRate);
  const mapDuration = Math.max(1, duration - trailingSilenceMs(rms, SPEECH_FRAME_MS, duration));
  const expected = proportionalStarts(tokens, mapDuration);

  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  const starts: number[] = [];
  for(let i = 0; i < tokens.length; i++) {
    let floor = i > 0 ? starts[i - 1] + 40 : 0;
    if(i > 0) {
      const prevShare = (tokens[i - 1].weight / totalWeight) * mapDuration;
      floor = Math.max(floor, starts[i - 1] + Math.max(120, prevShare - 80));
    }

    const snapped = onsets.length ?
      snapToNearestOnset(expected[i], onsets, SNAP_WINDOW_MS, floor) :
      Math.max(floor, expected[i]);
    starts.push(Math.max(0, Math.min(duration, snapped)));
  }

  return tokens.map((token, index) => {
    const startMs = starts[index];
    const next = index + 1 < starts.length ? starts[index + 1] : duration;
    return {
      word: token.word,
      trailing: token.trailing,
      startMs,
      endMs: Math.max(startMs + 1, next)
    };
  });
}

export function decodeWavPcm(bytes: ArrayBuffer | Uint8Array): PcmClip | undefined {
  const buffer = bytes instanceof ArrayBuffer ?
    bytes :
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buffer);
  if(view.byteLength < 44) {
    return undefined;
  }

  const tag = (offset: number) => String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
  if(tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    return undefined;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bits = 16;
  let dataOffset = 0;
  let dataBytes = 0;
  while(offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if(id === 'fmt ') {
      channels = view.getUint16(body + 2, true) || 1;
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true) || 16;
    } else if(id === 'data') {
      dataOffset = body;
      dataBytes = size;
      break;
    }

    offset = body + size + (size % 2);
  }

  if(!sampleRate || !dataOffset || bits !== 16) {
    return undefined;
  }

  const n = Math.floor(dataBytes / 2 / channels);
  const samples = new Float32Array(n);
  for(let i = 0; i < n; i++) {
    let acc = 0;
    for(let c = 0; c < channels; c++) {
      acc += view.getInt16(dataOffset + (i * channels + c) * 2, true);
    }

    samples[i] = (acc / channels) / 32768;
  }

  return {
    samples,
    sampleRate,
    durationMs: n / sampleRate * 1000
  };
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
        pcmCache.delete(src);
        return undefined;
      }

      const bytes = await response.arrayBuffer();
      const wav = decodeWavPcm(bytes);
      if(wav) {
        return wav;
      }

      const Ctx = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if(!Ctx) {
        pcmCache.delete(src);
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
      pcmCache.delete(src);
      return undefined;
    }
  })();

  pcmCache.set(src, pending);
  return pending;
}
