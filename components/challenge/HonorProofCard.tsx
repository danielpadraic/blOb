import { forwardRef } from 'react';
import Svg, { G, Image as SvgImage, Rect, Text as SvgText } from 'react-native-svg';

import {
  HONOR_CARD_HEIGHT,
  HONOR_CARD_INK as INK,
  HONOR_CARD_WIDTH,
  formatHonorFieldValue,
  type HonorCardModel,
} from '@/lib/checkin/honorCard';
import { BLOB_WORDMARK } from '@/lib/mascotAssets';
import { resolveScoringIconKey, type ScoringIconKey } from '@/lib/scoringIcons';

const ICON_SOURCES: Record<ScoringIconKey, number> = {
  calls: require('@/assets/scoring/calls.png'),
  presentation: require('@/assets/scoring/presentation.png'),
  money: require('@/assets/scoring/money.png'),
  star: require('@/assets/scoring/star.png'),
  checklist: require('@/assets/scoring/checklist.png'),
  calendar: require('@/assets/scoring/calendar.png'),
  camera: require('@/assets/scoring/camera.png'),
  timer: require('@/assets/scoring/timer.png'),
  steps: require('@/assets/scoring/steps.png'),
  route: require('@/assets/scoring/route.png'),
  strength: require('@/assets/scoring/strength.png'),
  heart: require('@/assets/scoring/heart.png'),
  fire: require('@/assets/scoring/fire.png'),
  hydration: require('@/assets/scoring/hydration.png'),
  reading: require('@/assets/scoring/reading.png'),
  writing: require('@/assets/scoring/writing.png'),
  learning: require('@/assets/scoring/learning.png'),
  trophy: require('@/assets/scoring/trophy.png'),
  generic: require('@/assets/scoring/star.png'),
};

const PAD = 72;
const INNER = HONOR_CARD_WIDTH - PAD * 2;
const ICON = 72;
const ROW_H = 168;

export function honorCardFit(boxWidth: number, boxHeight: number): { width: number; height: number } {
  const scale = Math.min(boxWidth / HONOR_CARD_WIDTH, boxHeight / HONOR_CARD_HEIGHT);
  if (!Number.isFinite(scale) || scale <= 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.floor(HONOR_CARD_WIDTH * scale),
    height: Math.floor(HONOR_CARD_HEIGHT * scale),
  };
}

type Props = {
  card: HonorCardModel;
  width?: number | string;
  height?: number | string;
};

export const HonorProofCard = forwardRef<Svg, Props>(function HonorProofCard(
  { card, width = HONOR_CARD_WIDTH, height = HONOR_CARD_HEIGHT },
  ref,
) {
  const rowTop = card.laneLabel ? 340 : 260;
  const chipW = Math.min(280, Math.max(160, card.laneLabel ? card.laneLabel.length * 28 + 48 : 0));

  return (
    <Svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${HONOR_CARD_WIDTH} ${HONOR_CARD_HEIGHT}`}>
      <Rect x={0} y={0} width={HONOR_CARD_WIDTH} height={HONOR_CARD_HEIGHT} fill={INK.bg} />
      <Rect
        x={PAD}
        y={PAD}
        width={INNER}
        height={HONOR_CARD_HEIGHT - PAD * 2}
        rx={40}
        fill={INK.surface}
      />
      <SvgText
        x={PAD + 48}
        y={170}
        fill={INK.ink}
        fontSize={44}
        fontWeight="700">
        {card.title}
      </SvgText>
      {card.laneLabel ? (
        <>
          <Rect
            x={PAD + 48}
            y={206}
            width={chipW}
            height={56}
            rx={28}
            fill={INK.tealSoft}
          />
          <SvgText
            x={PAD + 48 + chipW / 2}
            y={244}
            fill={INK.teal}
            fontSize={28}
            fontWeight="700"
            textAnchor="middle">
            {card.laneLabel}
          </SvgText>
        </>
      ) : null}
      {card.fields.map((field, index) => {
        const y = rowTop + index * ROW_H;
        const iconKey = resolveScoringIconKey({ icon_key: field.iconKey, name: field.label });
        return (
          <G key={field.key}>
            <Rect x={PAD + 40} y={y} width={INNER - 80} height={ROW_H - 24} rx={28} fill={INK.bg} />
            <SvgImage
              href={ICON_SOURCES[iconKey] ?? ICON_SOURCES.generic}
              x={PAD + 64}
              y={y + 36}
              width={ICON}
              height={ICON}
              preserveAspectRatio="xMidYMid meet"
            />
            <SvgText x={PAD + 160} y={y + 86} fill={INK.muted} fontSize={32} fontWeight="600">
              {field.label}
            </SvgText>
            <SvgText
              x={HONOR_CARD_WIDTH - PAD - 64}
              y={y + 90}
              fill={INK.ink}
              fontSize={48}
              fontWeight="800"
              textAnchor="end">
              {formatHonorFieldValue(field)}
            </SvgText>
          </G>
        );
      })}
      <SvgText
        x={PAD + 48}
        y={HONOR_CARD_HEIGHT - PAD - 48}
        fill={INK.muted}
        fontSize={28}
        fontWeight="500">
        {card.periodLabel}
      </SvgText>
      <SvgImage
        href={BLOB_WORDMARK}
        x={HONOR_CARD_WIDTH - PAD - 200}
        y={HONOR_CARD_HEIGHT - PAD - 88}
        width={168}
        height={56}
        preserveAspectRatio="xMaxYMid meet"
      />
    </Svg>
  );
});
