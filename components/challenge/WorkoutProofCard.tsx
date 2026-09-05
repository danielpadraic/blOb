import { forwardRef } from 'react';
import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { THEME } from '@/lib/theme';
import {
  WORKOUT_CARD_CHART,
  WORKOUT_CARD_HEIGHT,
  WORKOUT_CARD_WIDTH,
  type WorkoutProofCardModel,
} from '@/lib/health/workoutProofCard';
import type { HealthActivityType } from '@/services/health/types';

const BOB = require('@/assets/mascot/blob-icon.png');

const PAD = 104;
const CHART_X = PAD;
const CHART_Y = 968;

/** Card-only inks. Dark field from the theme primary, with lifted text on top of it. */
const INK = {
  field: THEME.primary,
  panel: '#171B1A',
  hairline: 'rgba(255, 255, 255, 0.10)',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.56)',
  teal: THEME.accentBright,
  tealDeep: THEME.accent,
} as const;

/**
 * Simple vector marks drawn from primitives. Deliberately not Apple Fitness artwork and not an
 * SF Symbol, because the card is rasterized through react-native-svg where symbols cannot render.
 */
function ActivityMark({ type, x, y }: { type: HealthActivityType; x: number; y: number }) {
  const stroke = INK.teal;
  if (type === 'running' || type === 'walking') {
    return (
      <G x={x} y={y}>
        <Circle cx={30} cy={9} r={9} fill={stroke} />
        <Path
          d="M30 20 L18 40 L28 46 L22 66 M28 46 L42 52 L46 68 M30 26 L46 34"
          stroke={stroke}
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    );
  }
  if (type === 'cycling') {
    return (
      <G x={x} y={y}>
        <Circle cx={14} cy={52} r={13} stroke={stroke} strokeWidth={6} fill="none" />
        <Circle cx={54} cy={52} r={13} stroke={stroke} strokeWidth={6} fill="none" />
        <Path
          d="M14 52 L30 24 L46 24 M30 24 L54 52"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    );
  }
  if (type === 'strength') {
    // Dumbbell: two plates and a bar.
    return (
      <G x={x} y={y}>
        <Rect x={0} y={22} width={12} height={30} rx={4} fill={stroke} />
        <Rect x={16} y={12} width={14} height={50} rx={5} fill={stroke} />
        <Rect x={38} y={12} width={14} height={50} rx={5} fill={stroke} />
        <Rect x={56} y={22} width={12} height={30} rx={4} fill={stroke} />
        <Rect x={28} y={32} width={12} height={10} fill={stroke} />
      </G>
    );
  }
  return (
    <G x={x} y={y}>
      <Circle cx={34} cy={37} r={26} stroke={stroke} strokeWidth={6} fill="none" />
      <Path d="M34 20 L34 37 L47 45" stroke={stroke} strokeWidth={6} strokeLinecap="round" fill="none" />
    </G>
  );
}

function PinMark({ x, y }: { x: number; y: number }) {
  return (
    <G x={x} y={y}>
      <Path
        d="M13 0 C5.8 0 0 5.8 0 13 C0 22 13 34 13 34 C13 34 26 22 26 13 C26 5.8 20.2 0 13 0 Z"
        fill={INK.muted}
      />
      <Circle cx={13} cy={13} r={5} fill={INK.field} />
    </G>
  );
}

type Props = {
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
  /** Rendered size. The viewBox keeps layout fixed, so this only scales the preview. */
  width?: number;
  height?: number;
};

/**
 * Portrait 1080x1350 proof card. Rasterized with Svg.toDataURL so no view-capture native module
 * is needed. Body metrics are never drawn here.
 */
export const WorkoutProofCard = forwardRef<Svg, Props>(function WorkoutProofCard(
  { card, activityType, width = WORKOUT_CARD_WIDTH, height = WORKOUT_CARD_HEIGHT },
  ref,
) {
  const statCell = (index: number) => ({
    x: PAD + (index % 2) * 470,
    y: 566 + Math.floor(index / 2) * 186,
  });

  return (
    <Svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${WORKOUT_CARD_WIDTH} ${WORKOUT_CARD_HEIGHT}`}>
      <Rect x={0} y={0} width={WORKOUT_CARD_WIDTH} height={WORKOUT_CARD_HEIGHT} fill={INK.field} />

      {/* Bob sits low and faint. If the asset has not decoded yet the card still rasterizes. */}
      <SvgImage
        href={BOB}
        x={WORKOUT_CARD_WIDTH - 430}
        y={WORKOUT_CARD_HEIGHT - 430}
        width={360}
        height={360}
        opacity={0.07}
        preserveAspectRatio="xMidYMid meet"
      />

      <SvgText x={PAD} y={132} fill={INK.muted} fontSize={34} fontWeight="500">
        {card.dateLine}
      </SvgText>
      <SvgText
        x={WORKOUT_CARD_WIDTH - PAD}
        y={136}
        fill={INK.teal}
        fontSize={44}
        fontWeight="700"
        textAnchor="end">
        blOb
      </SvgText>

      <ActivityMark type={activityType} x={PAD} y={214} />
      <SvgText x={PAD + 100} y={274} fill={INK.text} fontSize={56} fontWeight="700">
        {card.activityLabel}
      </SvgText>

      <SvgText x={PAD} y={362} fill={INK.muted} fontSize={38} fontWeight="500">
        {card.timeRange}
      </SvgText>

      {card.placeLine ? (
        <>
          <PinMark x={PAD} y={402} />
          <SvgText x={PAD + 40} y={428} fill={INK.muted} fontSize={34} fontWeight="500">
            {card.placeLine}
          </SvgText>
        </>
      ) : null}

      <Rect x={PAD} y={478} width={WORKOUT_CARD_WIDTH - PAD * 2} height={1} fill={INK.hairline} />

      {card.stats.map((stat, index) => {
        const cell = statCell(index);
        return (
          <G key={stat.key}>
            <SvgText x={cell.x} y={cell.y} fill={INK.muted} fontSize={30} fontWeight="600">
              {stat.label}
            </SvgText>
            <SvgText x={cell.x} y={cell.y + 84} fill={INK.text} fontSize={86} fontWeight="700">
              {stat.value}
            </SvgText>
          </G>
        );
      })}

      <SvgText x={PAD} y={926} fill={INK.muted} fontSize={30} fontWeight="600">
        Heart rate
      </SvgText>

      {card.heartRate.sparkline ? (
        <>
          <Rect
            x={CHART_X}
            y={CHART_Y}
            width={WORKOUT_CARD_CHART.width}
            height={WORKOUT_CARD_CHART.height}
            rx={18}
            fill={INK.panel}
          />
          <G x={CHART_X} y={CHART_Y}>
            <Path
              d={card.heartRate.sparkline.path}
              stroke={INK.teal}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
          <SvgText x={CHART_X} y={CHART_Y + WORKOUT_CARD_CHART.height + 46} fill={INK.muted} fontSize={28}>
            {`MIN ${card.heartRate.minLabel}`}
          </SvgText>
          <SvgText
            x={CHART_X + WORKOUT_CARD_CHART.width}
            y={CHART_Y + WORKOUT_CARD_CHART.height + 46}
            fill={INK.muted}
            fontSize={28}
            textAnchor="end">
            {`MAX ${card.heartRate.maxLabel}`}
          </SvgText>
          {card.heartRate.avgLine ? (
            <SvgText
              x={PAD}
              y={CHART_Y + WORKOUT_CARD_CHART.height + 108}
              fill={INK.text}
              fontSize={40}
              fontWeight="700">
              {card.heartRate.avgLine}
            </SvgText>
          ) : null}
        </>
      ) : (
        <>
          <Rect
            x={CHART_X}
            y={CHART_Y}
            width={WORKOUT_CARD_CHART.width}
            height={WORKOUT_CARD_CHART.height}
            rx={18}
            fill={INK.panel}
          />
          <SvgText
            x={WORKOUT_CARD_WIDTH / 2}
            y={CHART_Y + WORKOUT_CARD_CHART.height / 2 + 12}
            fill={INK.muted}
            fontSize={34}
            fontWeight="500"
            textAnchor="middle">
            {card.heartRate.emptyLine}
          </SvgText>
        </>
      )}

      <Rect x={PAD} y={1232} width={WORKOUT_CARD_WIDTH - PAD * 2} height={1} fill={INK.hairline} />
      <SvgText x={PAD} y={1290} fill={INK.muted} fontSize={30} fontWeight="500">
        {card.sourceLine}
      </SvgText>
      <SvgText
        x={WORKOUT_CARD_WIDTH - PAD}
        y={1290}
        fill={INK.tealDeep}
        fontSize={30}
        fontWeight="600"
        textAnchor="end">
        {card.proofLine}
      </SvgText>
    </Svg>
  );
});
