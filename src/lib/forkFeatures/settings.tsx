import {createSignal, For} from 'solid-js';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {i18n} from '@lib/langPack';
import {
  FORK_FEATURE_IDS,
  ForkFeatureId,
  isForkFeatureEnabled,
  setForkFeatureEnabled
} from '@lib/forkFeatures/flags';

const LABELS: Record<ForkFeatureId, {title: 'ForkFeatures.VoiceScore' | 'ForkFeatures.ReplyLoom' | 'ForkFeatures.Fan' | 'ForkFeatures.YearRail', info: 'ForkFeatures.VoiceScore.Info' | 'ForkFeatures.ReplyLoom.Info' | 'ForkFeatures.Fan.Info' | 'ForkFeatures.YearRail.Info'}> = {
  voiceScore: {title: 'ForkFeatures.VoiceScore', info: 'ForkFeatures.VoiceScore.Info'},
  replyLoom: {title: 'ForkFeatures.ReplyLoom', info: 'ForkFeatures.ReplyLoom.Info'},
  fan: {title: 'ForkFeatures.Fan', info: 'ForkFeatures.Fan.Info'},
  yearRail: {title: 'ForkFeatures.YearRail', info: 'ForkFeatures.YearRail.Info'}
};

export default function ForkFeaturesSection() {
  const [flags, setFlags] = createSignal(Object.fromEntries(
    FORK_FEATURE_IDS.map((id) => [id, isForkFeatureEnabled(id)])
  ) as Record<ForkFeatureId, boolean>);

  return (
    <Section name="ForkFeatures.Title" caption="ForkFeatures.Caption">
      <For each={FORK_FEATURE_IDS}>{(id) => (
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              toggle
              checked={flags()[id]}
              onChange={(checked) => {
                setForkFeatureEnabled(id, checked);
                setFlags({...flags(), [id]: checked});
              }}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n(LABELS[id].title)}</Row.Title>
          <Row.Subtitle>{i18n(LABELS[id].info)}</Row.Subtitle>
        </Row>
      )}</For>
    </Section>
  );
}
