import {createEffect, createMemo, createSignal, For, onCleanup} from 'solid-js';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {
  estimateWordTimings,
  highlightIndex,
  seekIsNearOnset,
  VoiceScoreWord
} from '@lib/forkFeatures/voiceScore/wordTimings';
import {durationMsFromSeconds, seekAudioToWord, seekSecondsForWord} from '@lib/forkFeatures/voiceScore/seekAudio';
import {alignWordsToSpeech, decodeMediaPcm} from '@lib/forkFeatures/voiceScore/speechOnsets';

type TranscribableRow = HTMLElement & {
  message?: {mid?: number},
  audio?: HTMLMediaElement,
  playWithTimestamp?: (timestamp: number) => void
};

function mediaDurationMs(
  audio: HTMLMediaElement | undefined,
  pcmDurationMs: number | undefined,
  fallbackSec: number
): number {
  if(pcmDurationMs && pcmDurationMs > 0) {
    return pcmDurationMs;
  }

  if(audio && Number.isFinite(audio.duration) && audio.duration > 0) {
    return durationMsFromSeconds(audio.duration);
  }

  return durationMsFromSeconds(fallbackSec);
}

export default function VoiceScoreWords(props: {
  text: string,
  durationSec: number,
  row: () => TranscribableRow
}) {
  const [liveDurationSec, setLiveDurationSec] = createSignal(props.durationSec || 0);
  const [aligned, setAligned] = createSignal<VoiceScoreWord[] | undefined>();
  const [pinnedIndex, setPinnedIndex] = createSignal(-1);
  const [timeMs, setTimeMs] = createSignal(-1);

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

  const activeIndex = createMemo(() => highlightIndex(words(), timeMs(), pinnedIndex()));

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
      decodeMediaPcm(audio).then((pcm) => {
        if(cancelled) {
          return;
        }

        const ms = mediaDurationMs(audio, pcm?.durationMs, durationSec());
        if(!(ms > 0)) {
          return;
        }

        if(pcm?.samples && pcm.sampleRate) {
          const timed = alignWordsToSpeech(text, pcm.durationMs || ms, pcm.samples, pcm.sampleRate);
          const mediaMs = mediaDurationMs(audio, undefined, durationSec());
          if(mediaMs > 0 && pcm.durationMs > 0 && Math.abs(mediaMs - pcm.durationMs) >= 12) {
            const k = mediaMs / pcm.durationMs;
            setAligned(timed.map((word) => ({
              ...word,
              startMs: word.startMs * k,
              endMs: word.endMs * k
            })));
            return;
          }

          setAligned(timed);
          return;
        }

        setAligned(alignWordsToSpeech(text, ms));
      });
    };

    const onTime = () => {
      if(audio.paused && audio.currentTime <= 0) {
        setTimeMs(-1);
        setPinnedIndex(-1);
        return;
      }

      setTimeMs(audio.currentTime * 1000);
    };

    syncDuration();
    alignFromPcm();
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('loadedmetadata', alignFromPcm);
    audio.addEventListener('durationchange', alignFromPcm);
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
      audio.removeEventListener('durationchange', alignFromPcm);
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
    setPinnedIndex(index);
    setTimeMs(word.startMs);

    const seconds = seekAudioToWord(audio, word, previous);

    const syncPlayhead = () => {
      const nowMs = audio.currentTime * 1000;
      if(nowMs + 1 < word.startMs - 1 && !seekIsNearOnset(word, nowMs, undefined, previous)) {
        setCurrentTime(audio, seekSecondsForWord(word, previous));
      }

      setTimeMs(audio.currentTime * 1000);
    };

    if(typeof row.playWithTimestamp === 'function') {
      row.playWithTimestamp(seconds);
      audio.addEventListener('seeked', syncPlayhead, {once: true});
      queueMicrotask(syncPlayhead);
      return;
    }

    setCurrentTime(audio, seconds);
    audio.addEventListener('seeked', syncPlayhead, {once: true});
    queueMicrotask(syncPlayhead);
    audio.play()?.catch(() => {});
  };

  return (
    <span
      class="voice-score-words"
      data-fork-feature="voice-score"
      data-aligned={aligned() ? 'speech' : 'estimate'}
      data-active-index={String(activeIndex())}
    >
      <For each={words()}>{(word, index) => {
        const cls = () => {
          const active = activeIndex();
          if(index() === active) {
            return 'now';
          }

          if(active >= 0 && index() < active) {
            return 'said';
          }

          return '';
        };
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
