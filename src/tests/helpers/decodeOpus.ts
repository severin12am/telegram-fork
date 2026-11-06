import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeWavPcm, PcmClip} from '@lib/forkFeatures/voiceScore/speechOnsets';

/** Decode an OGG/Opus voice note the same way Telegram stores it, via ffmpeg. */
export function decodeOpusFile(oggPath: string): PcmClip {
  const dir = mkdtempSync(join(tmpdir(), 'tweb-opus-'));
  const wav = join(dir, 'out.wav');
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', oggPath, '-ac', '1', '-f', 'wav', wav], {stdio: 'pipe'});
    const pcm = decodeWavPcm(readFileSync(wav));
    if(!pcm) {
      throw new Error('ffmpeg wrote a WAV that decodeWavPcm could not read: ' + oggPath);
    }

    return pcm;
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
