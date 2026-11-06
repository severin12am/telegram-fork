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
/** Merge only clicks/pops, never a comma pause. */
export const HOLE_FILL_MS = 30;
export const MIN_SPEECH_MS = 40;
export const ONSET_DIP_MS = 35;
export const MIN_ONSET_GAP_MS = 50;
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

export function speechRegionsFromRms(
  rms: Float32Array,
  frameMs = SPEECH_FRAME_MS,
  holeFillMs = HOLE_FILL_MS,
  minSpeechMs = MIN_SPEECH_MS
): SpeechRegion[] {
  const threshold = speechThreshold(rms);
  const raw = Array.from(rms, (value) => value >= threshold);
  const mask = closeShortHoles(raw, Math.max(1, Math.round(holeFillMs / frameMs)));
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

function clusterOnsets(onsets: number[], maxGap = 140): number[] {
  const clustered: number[] = [];
  for(const onset of onsets) {
    if(clustered.length && onset - clustered[clustered.length - 1] < maxGap) {
      continue;
    }

    clustered.push(onset);
  }

  return clustered;
}

function expectedStartsFromEnergy(
  tokens: Array<{weight: number}>,
  rms: Float32Array,
  frameMs: number,
  durationMs: number
): number[] {
  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  const prefix = new Float32Array(rms.length);
  let energy = 0;
  for(let i = 0; i < rms.length; i++) {
    energy += rms[i];
    prefix[i] = energy;
  }

  if(!(energy > 0)) {
    let cursor = 0;
    return tokens.map((token) => {
      const start = cursor;
      cursor += (token.weight / totalWeight) * Math.max(1, durationMs);
      return start;
    });
  }

  let acc = 0;
  let frame = 0;
  return tokens.map((token) => {
    const target = (acc / totalWeight) * energy;
    while(frame < prefix.length && prefix[frame] < target) {
      frame++;
    }

    acc += token.weight;
    return Math.min(durationMs, frame * frameMs);
  });
}

function costToOnset(onset: number, expected: number): number {
  const back = Math.max(0, expected - onset);
  const fwd = Math.max(0, onset - expected);
  return fwd + back * 1.7;
}

/**
 * Match n tokens to n increasing onsets. Extra onsets (intra-word clicks)
 * are skipped. A later onset is preferred over snapping backward into the
 * previous word.
 */
export function assignOnsetsToWords(
  expected: number[],
  onsets: number[],
  minGap = MIN_ONSET_GAP_MS
): number[] | undefined {
  const n = expected.length;
  const m = onsets.length;
  if(!n) {
    return [];
  }

  if(m < n) {
    return undefined;
  }

  const INF = 1e18;
  const dp: number[][] = Array.from({length: n}, () => Array<number>(m).fill(INF));
  const parent: number[][] = Array.from({length: n}, () => Array<number>(m).fill(-1));

  for(let j = 0; j <= m - n; j++) {
    dp[0][j] = costToOnset(onsets[j], expected[0]);
  }

  for(let i = 1; i < n; i++) {
    const maxJ = m - (n - i);
    for(let j = i; j <= maxJ; j++) {
      const local = costToOnset(onsets[j], expected[i]);
      for(let k = i - 1; k < j; k++) {
        if(onsets[j] - onsets[k] < minGap) {
          continue;
        }

        const cost = dp[i - 1][k] + local;
        if(cost < dp[i][j]) {
          dp[i][j] = cost;
          parent[i][j] = k;
        }
      }
    }
  }

  let bestJ = -1;
  let best = INF;
  for(let j = n - 1; j < m; j++) {
    if(dp[n - 1][j] < best) {
      best = dp[n - 1][j];
      bestJ = j;
    }
  }

  if(bestJ < 0 || !(best < INF / 2)) {
    return undefined;
  }

  const chosen = Array<number>(n);
  let j = bestJ;
  for(let i = n - 1; i >= 0; i--) {
    chosen[i] = onsets[j];
    j = parent[i][j];
  }

  return chosen;
}

function greedyOnsets(expected: number[], onsets: number[], minGap: number): number[] {
  const n = expected.length;
  const snapped: number[] = [];
  let used = -1;
  for(let i = 0; i < n; i++) {
    const remaining = n - i;
    const lastLegal = onsets.length - remaining;
    const earliest = used < 0 ? -Infinity : onsets[used] + minGap;
    let best = -1;
    let bestCost = Infinity;
    for(let j = used + 1; j <= lastLegal; j++) {
      if(onsets[j] < earliest) {
        continue;
      }

      const cost = costToOnset(onsets[j], expected[i]);
      if(cost < bestCost) {
        bestCost = cost;
        best = j;
      }
    }

    if(best >= 0) {
      snapped.push(onsets[best]);
      used = best;
    } else {
      const prev = snapped.length ? snapped[snapped.length - 1] + minGap : 0;
      snapped.push(Math.max(expected[i], prev));
    }
  }

  return snapped;
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

function packTokensIntoRegions(
  text: string,
  tokens: Array<{word: string, trailing: string, weight: number}>,
  regions: SpeechRegion[]
): VoiceScoreWord[] | undefined {
  const utterances = splitUtterances(text);
  const utteranceTokens = utterances.map((utterance) => tokenizeTranscript(utterance)).filter((group) => group.length);
  const packed: VoiceScoreWord[] = [];
  if(utteranceTokens.length && utteranceTokens.length >= regions.length) {
    for(const {group, region} of assignGroupsToRegions(utteranceTokens, regions)) {
      const slice = group.flat();
      if(!slice.length) {
        continue;
      }

      packed.push(...interpolateTokens(slice, region.startMs, region.endMs));
    }
  } else {
    let tokenIndex = 0;
    const speech = regions.reduce((sum, region) => sum + (region.endMs - region.startMs), 0) || 1;
    for(let r = 0; r < regions.length; r++) {
      const region = regions[r];
      const leftTokens = tokens.length - tokenIndex;
      const leftRegions = regions.length - r;
      const take = r === regions.length - 1 ?
        leftTokens :
        Math.max(1, Math.min(leftTokens - (leftRegions - 1), Math.round(leftTokens * (
          (region.endMs - region.startMs) / Math.max(1, speech)
        ))));
      const slice = tokens.slice(tokenIndex, tokenIndex + Math.max(1, take));
      tokenIndex += slice.length;
      packed.push(...interpolateTokens(slice, region.startMs, region.endMs));
    }
  }

  return packed.length === tokens.length ? packed : undefined;
}

function acousticEnd(startMs: number, nextStart: number, regions: SpeechRegion[]): number {
  for(const region of regions) {
    if(startMs >= region.startMs && startMs < region.endMs) {
      return Math.max(startMs, Math.min(region.endMs, nextStart));
    }
  }

  return Math.max(startMs, nextStart);
}

/**
 * Put each transcript token on real speech. Telegram's transcription has no
 * per-word times, so an even character split lands a click inside the previous
 * word. Pack tokens along the speech-only timeline (pauses are not time the
 * words share), then snap each start to its own energy onset.
 */
export function alignWordsToSpeech(
  text: string,
  durationMs: number,
  samples?: Float32Array,
  sampleRate?: number
): VoiceScoreWord[] {
  const tokens = tokenizeTranscript(text);
  const fallback = estimateWordTimings(text, durationMs);
  if(!samples || !sampleRate || !tokens.length) {
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

  const rms = rmsFrames(samples, sampleRate);
  const expected = expectedStartsFromEnergy(tokens, rms, SPEECH_FRAME_MS, durationMs);
  const onsets = clusterOnsets(
    detectWordOnsets(samples, sampleRate)
      .map((onset) => Math.max(0, Math.min(durationMs, onset)))
  );

  const avgWordMs = Math.max(1, durationMs / tokens.length);
  const minGap = Math.max(MIN_ONSET_GAP_MS, Math.min(340, avgWordMs * 0.52));
  let snapped: number[] | undefined;
  if(onsets.length >= tokens.length) {
    snapped = assignOnsetsToWords(expected, onsets, minGap) ||
      greedyOnsets(expected, onsets, minGap);
  } else {
    const packed = packTokensIntoRegions(text, tokens, regions);
    if(packed) {
      return packed.map((word, index) => {
        const next = packed[index + 1]?.startMs ?? regions[regions.length - 1].endMs;
        return {
          ...word,
          endMs: acousticEnd(word.startMs, next, regions)
        };
      });
    }

    snapped = greedyOnsets(expected, onsets, MIN_ONSET_GAP_MS);
  }

  const lastRegionEnd = regions[regions.length - 1].endMs;
  return tokens.map((token, index) => {
    const startMs = snapped[index] ?? expected[index] ?? 0;
    const nextStart = index + 1 < tokens.length ?
      (snapped[index + 1] ?? expected[index + 1] ?? lastRegionEnd) :
      lastRegionEnd;
    return {
      word: token.word,
      trailing: token.trailing,
      startMs,
      endMs: acousticEnd(startMs, Math.max(startMs, nextStart), regions)
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
        return undefined;
      }

      const bytes = await response.arrayBuffer();
      const wav = decodeWavPcm(bytes);
      if(wav) {
        return wav;
      }

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
