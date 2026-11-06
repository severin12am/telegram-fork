import {createEffect, createMemo, createSignal, For, onCleanup} from 'solid-js';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {estimateWordTimings, VoiceScoreWord, wordClassAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';
import {durationMsFromSeconds, seekAudioToWord, seekSecondsForWord} from '@lib/forkFeatures/voiceScore/seekAudio';

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

  const durationSec = createMemo(() => {
    const live = liveDurationSec();
    if(live > 0) {
      return live;
    }

    return props.durationSec || 0;
  });

  const words = createMemo(() => {
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

    const syncDuration = () => {
      if(Number.isFinite(audio.duration) && audio.duration > 0) {
        setLiveDurationSec(audio.duration);
      }
    };

    const onTime = () => {
      if(audio.paused && audio.currentTime <= 0) {
        setTimeMs(-1);
        return;
      }

      setTimeMs(audio.currentTime * 1000);
    };

    syncDuration();
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onTime);
    audio.addEventListener('pause', onTime);
    audio.addEventListener('ended', onTime);
    audio.addEventListener('seeked', onTime);
    onTime();

    onCleanup(() => {
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
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

    const duration = (Number.isFinite(audio.duration) && audio.duration > 0) ?
      audio.duration :
      durationSec();
    const timed = estimateWordTimings(props.text, durationMsFromSeconds(duration) || 1);
    const word = timed[index] || fallback;
    const seconds = seekAudioToWord(audio, word);
    setTimeMs(seconds * 1000);

    const correctIfEarly = () => {
      if(audio.currentTime + 1e-3 < word.startMs / 1000) {
        const inner = seekSecondsForWord(word);
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
    <span class="voice-score-words" data-fork-feature="voice-score">
      <For each={words()}>{(word, index) => {
        const cls = () => wordClassAtTime(word, timeMs());
        return (
          <>
            <button
              type="button"
              class="voice-score-word"
              data-word-index={index()}
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
