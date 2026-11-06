export type PauseWavSpec = {
  sampleRate?: number,
  word1Ms: number,
  gapMs: number,
  word2Ms: number,
  freq1?: number,
  freq2?: number
};

export type PauseWav = {
  samples: Float32Array,
  sampleRate: number,
  durationMs: number,
  onset1Ms: number,
  onset2Ms: number,
  bytes: Uint8Array
};

function writeString(view: DataView, offset: number, value: string) {
  for(let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for(let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeTone(samples: Float32Array, offset: number, n: number, sampleRate: number, freq: number) {
  for(let i = 0; i < n; i++) {
    const window = Math.sin(Math.PI * i / Math.max(1, n - 1));
    samples[offset + i] = Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.55 * window;
  }
}

/**
 * Two voiced bursts with a silent gap between them — the same shape as a
 * Russian voice note that pauses before "Они".
 */
export function makePauseWav(spec: PauseWavSpec): PauseWav {
  const sampleRate = spec.sampleRate || 16000;
  const word1 = Math.max(1, Math.round(sampleRate * spec.word1Ms / 1000));
  const gap = Math.max(0, Math.round(sampleRate * spec.gapMs / 1000));
  const word2 = Math.max(1, Math.round(sampleRate * spec.word2Ms / 1000));
  const samples = new Float32Array(word1 + gap + word2);
  writeTone(samples, 0, word1, sampleRate, spec.freq1 || 420);
  writeTone(samples, word1 + gap, word2, sampleRate, spec.freq2 || 780);
  const durationMs = samples.length / sampleRate * 1000;
  return {
    samples,
    sampleRate,
    durationMs,
    onset1Ms: 0,
    onset2Ms: spec.word1Ms + spec.gapMs,
    bytes: encodeWav(samples, sampleRate)
  };
}

export function pauseWavUrl(wav: PauseWav): string {
  const bytes = new Uint8Array(wav.bytes.byteLength);
  bytes.set(wav.bytes);
  const blob = new Blob([bytes.buffer], {type: 'audio/wav'});
  return URL.createObjectURL(blob);
}
