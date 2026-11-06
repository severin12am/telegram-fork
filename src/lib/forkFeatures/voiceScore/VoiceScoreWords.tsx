import {createEffect, createMemo, createSignal, For, onCleanup} from 'solid-js';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {estimateWordTimings, seekIsNearOnset, VoiceScoreWord, wordClassAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';
import {durationMsFromSeconds, seekAudioToWord, seekSecondsForWord} from '@lib/forkFeatures/voiceScore/seekAudio';
import {alignWordsToSpeech, decodeMediaPcm} from '@lib/forkFeatures/voiceScore/speechOnsets';

type TranscribableRow = HTMLElement & {
  message?: {mid?: number},
  audio?: HTMLMediaElement,
  playWithTimestamp?: (timestamp: number) => void
};

export default function VoiceScoreWords(props: {
  text: string,
  durationSec: number,
  row: () => TranscribableRow
}) {
  const [liveDurationSec, setLiveDurationSec] = createSignal(props.durationSec || 0);
  const [aligned, setAligned] = createSignal<VoiceScoreWord[] | undefined>();

  const durationSec = createMemo(() => {
    const live = liveDurationSec();
    if(live > 0) {
      return live;
    }

    return props.durationSec || 0;
  });

  const words = createMemo(() => {
    const timed = aligned();
    if(timed && timed.length) {
      return timed;
    }

    const ms = durationMsFromSeconds(durationSec());
    if(ms <= 0) {
      return estimateWordTimings(props.text, 1);
    }

    return estimateWordTimings(props.text, ms);
  });
  const [timeMs, setTimeMs] = createSignal(-1);

  createEffect(() => {
    const row = props.row();
    if(!isForkFeatureEnabled('voiceScore')) {
      return;
    }

    const audio = row.audio;
    if(!audio) {
      return;
    }

    const text = props.text;
    let cancelled = false;

    const syncDuration = () => {
      if(Number.isFinite(audio.duration) && audio.duration > 0) {
        setLiveDurationSec(audio.duration);
      }
    };

    const alignFromPcm = () => {
      const duration = (Number.isFinite(audio.duration) && audio.duration > 0) ?
        audio.duration :
        durationSec();
      decodeMediaPcm(audio).then((pcm) => {
        if(cancelled || !pcm) {
          return;
        }

        const ms = durationMsFromSeconds(duration) || pcm.durationMs;
        setAligned(alignWordsToSpeech(text, ms, pcm.samples, pcm.sampleRate));
      });
    };

    const onTime = () => {
      if(audio.paused && audio.currentTime <= 0) {
        setTimeMs(-1);
        return;
      }

      setTimeMs(audio.currentTime * 1000);
    };

    syncDuration();
    alignFromPcm();
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('loadedmetadata', alignFromPcm);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onTime);
    audio.addEventListener('pause', onTime);
    audio.addEventListener('ended', onTime);
    audio.addEventListener('seeked', onTime);
    onTime();

    onCleanup(() => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('loadedmetadata', alignFromPcm);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onTime);
      audio.removeEventListener('pause', onTime);
      audio.removeEventListener('ended', onTime);
      audio.removeEventListener('seeked', onTime);
    });
  });

  const seekTo = (index: number, fallback: VoiceScoreWord) => {
    const row = props.row();
    const audio = row.audio;
    if(!audio) {
      return;
    }

    const timed = words();
    const word = timed[index] || fallback;
    const previous = index > 0 ? timed[index - 1] : undefined;
    const seconds = seekAudioToWord(audio, word, previous);
    setTimeMs(seconds * 1000);

    const correctIfEarly = () => {
      const nowMs = audio.currentTime * 1000;
      const floorMs = previous ? previous.endMs : 0;
      if(nowMs + 1 < floorMs || !seekIsNearOnset(word, nowMs, undefined, previous)) {
        const inner = seekSecondsForWord(word, previous);
        setCurrentTime(audio, inner);
      }

      setTimeMs(audio.currentTime * 1000);
    };

    if(typeof row.playWithTimestamp === 'function') {
      row.playWithTimestamp(seconds);
      audio.addEventListener('seeked', correctIfEarly, {once: true});
      queueMicrotask(correctIfEarly);
      return;
    }

    setCurrentTime(audio, seconds);
    audio.addEventListener('seeked', correctIfEarly, {once: true});
    queueMicrotask(correctIfEarly);
    audio.play()?.catch(() => {});
  };

  return (
    <span class="voice-score-words" data-fork-feature="voice-score" data-aligned={aligned() ? 'speech' : 'estimate'}>
      <For each={words()}>{(word, index) => {
        const cls = () => wordClassAtTime(word, timeMs());
        return (
          <>
            <button
              type="button"
              class="voice-score-word"
              data-word-index={index()}
              data-start-ms={String(Math.round(word.startMs))}
              classList={{
                'voice-score-word-now': cls() === 'now',
                'voice-score-word-said': cls() === 'said'
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                seekTo(index(), word);
              }}
            >
              {word.word}
            </button>
            {word.trailing}
          </>
        );
      }}</For>
    </span>
  );
}
