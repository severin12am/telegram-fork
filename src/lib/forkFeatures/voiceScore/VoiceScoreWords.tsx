import {createEffect, createMemo, createSignal, For, onCleanup} from 'solid-js';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {estimateWordTimings, VoiceScoreWord, wordClassAtTime} from '@lib/forkFeatures/voiceScore/wordTimings';

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
  const words = createMemo(() => estimateWordTimings(props.text, Math.max(400, (props.durationSec || 0) * 1000)));
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

    const onTime = () => {
      if(audio.paused && audio.currentTime <= 0) {
        setTimeMs(-1);
        return;
      }

      setTimeMs(audio.currentTime * 1000);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onTime);
    audio.addEventListener('pause', onTime);
    audio.addEventListener('ended', onTime);
    onTime();

    onCleanup(() => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onTime);
      audio.removeEventListener('pause', onTime);
      audio.removeEventListener('ended', onTime);
    });
  });

  const seekTo = (word: VoiceScoreWord) => {
    const row = props.row();
    if(!row.audio) {
      return;
    }

    const seconds = Math.max(0, word.startMs / 1000);
    if(typeof row.playWithTimestamp === 'function') {
      row.playWithTimestamp(seconds);
      return;
    }

    setCurrentTime(row.audio, seconds);
    row.audio.play()?.catch(() => {});
  };

  return (
    <span class="voice-score-words" data-fork-feature="voice-score">
      <For each={words()}>{(word) => {
        const cls = () => wordClassAtTime(word, timeMs());
        return (
          <>
            <button
              type="button"
              class="voice-score-word"
              classList={{
                'voice-score-word-now': cls() === 'now',
                'voice-score-word-said': cls() === 'said'
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                seekTo(word);
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
