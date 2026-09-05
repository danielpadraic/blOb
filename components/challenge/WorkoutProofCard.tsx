import { forwardRef, useEffect, useRef, useState } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  Image as SvgImage,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { MASCOT_STAMP } from '@/lib/mascotAssets';
import { projectRoute } from '@/lib/health/route';
import {
  WORKOUT_CARD_HEIGHT,
  WORKOUT_CARD_WIDTH,
  type WorkoutProofCardModel,
} from '@/lib/health/workoutProofCard';
import type { HealthActivityType } from '@/services/health/types';

// Stamp comes from the shared helper only, with no fallback to another mascot file.
const BOB = MASCOT_STAMP;

const PAD = 84;
const INNER = WORKOUT_CARD_WIDTH - PAD * 2;

/** Bob rides the top-right corner opposite the date, above the hero band. */
const STAMP = 132;

/**
 * The hero band. A route map and the indoor stats composition occupy the same box, so an indoor card
 * is never a finished layout with a hole in it.
 *
 * A route card takes the taller box and drops the heart-rate trace: average and max are already in
 * the stats strip, and the map earns that space. An indoor card keeps the trace, which is the visual
 * interest when there is no line to draw.
 */
const HERO_BASE = { x: PAD, y: 396, width: INNER, radius: 36 } as const;
const HERO_ROUTE_HEIGHT = 780;
const HERO_PLAIN_HEIGHT = 596;

/** Room reserved at the foot of the hero for the headline and stats over a dark scrim. */
const SCRIM = 190;

/** Compact heart-rate band under the hero, indoor cards only. */
const HR = { x: PAD, y: 1046, width: INNER, height: 128, radius: 24 } as const;

/** Card-only inks. Text sits on a dark field, so contrast is driven from white down. */
const INK = {
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.58)',
  faint: 'rgba(255, 255, 255, 0.34)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  panel: 'rgba(255, 255, 255, 0.05)',
} as const;

/**
 * Simple vector marks drawn from primitives. Deliberately not Apple Fitness artwork and not an
 * SF Symbol, because the card is rasterized through react-native-svg where symbols cannot render.
 */
function ActivityMark({ type, x, y, color }: { type: HealthActivityType; x: number; y: number; color: string }) {
  if (type === 'running' || type === 'walking') {
    return (
      <G x={x} y={y}>
        <Circle cx={30} cy={9} r={9} fill={color} />
        <Path
          d="M30 20 L18 40 L28 46 L22 66 M28 46 L42 52 L46 68 M30 26 L46 34"
          stroke={color}
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
        <Circle cx={14} cy={52} r={13} stroke={color} strokeWidth={6} fill="none" />
        <Circle cx={54} cy={52} r={13} stroke={color} strokeWidth={6} fill="none" />
        <Path
          d="M14 52 L30 24 L46 24 M30 24 L54 52"
          stroke={color}
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
        <Rect x={0} y={22} width={12} height={30} rx={4} fill={color} />
        <Rect x={16} y={12} width={14} height={50} rx={5} fill={color} />
        <Rect x={38} y={12} width={14} height={50} rx={5} fill={color} />
        <Rect x={56} y={22} width={12} height={30} rx={4} fill={color} />
        <Rect x={28} y={32} width={12} height={10} fill={color} />
      </G>
    );
  }
  return (
    <G x={x} y={y}>
      <Circle cx={34} cy={37} r={26} stroke={color} strokeWidth={6} fill="none" />
      <Path d="M34 20 L34 37 L47 45" stroke={color} strokeWidth={6} strokeLinecap="round" fill="none" />
    </G>
  );
}

function PinMark({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G x={x} y={y}>
      <Path
        d="M13 0 C5.8 0 0 5.8 0 13 C0 22 13 34 13 34 C13 34 26 22 26 13 C26 5.8 20.2 0 13 0 Z"
        fill={color}
      />
      <Circle cx={13} cy={13} r={5} fill="#0A0C0C" />
    </G>
  );
}

/**
 * One-shot reveal for the in-app preview, 0 to 1.
 *
 * Driven from a timer rather than Reanimated because this component is also rasterized offscreen:
 * the flattened JPEG must be the finished frame, and `animate={false}` guarantees the very first
 * render is already complete. Plain state also behaves identically on iOS, Android and Web.
 */
function useReveal(animate: boolean, durationMs = 900): number {
  const [progress, setProgress] = useState(animate ? 0 : 1);
  const frame = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!animate) {
      setProgress(1);
      return;
    }
    const started = Date.now();
    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      const elapsed = Date.now() - started;
      const linear = Math.min(elapsed / durationMs, 1);
      // Ease out so the line lands softly instead of stopping dead.
      setProgress(1 - (1 - linear) ** 3);
      if (linear < 1) {
        frame.current = setTimeout(tick, 32);
      }
    };
    frame.current = setTimeout(tick, 32);
    return () => {
      cancelled = true;
      if (frame.current) {
        clearTimeout(frame.current);
      }
    };
  }, [animate, durationMs]);

  return progress;
}

/** Total length of a projected polyline, used to drive the dash reveal. */
function pathLength(points: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

/** Counts a numeric value up on first paint, leaving any unit suffix intact. */
function countUp(value: string, progress: number): string {
  if (progress >= 1) {
    return value;
  }
  const match = /^(\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  if (!match) {
    return value;
  }
  const target = Number(match[1]);
  const decimals = (match[1].split('.')[1] ?? '').length;
  return `${(target * progress).toFixed(decimals)}${match[2]}`;
}

type Props = {
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
  /** Rendered size. The viewBox keeps layout fixed, so this only scales the preview. */
  width?: number;
  height?: number;
  /**
   * Animate the route draw and the headline count-up once. Left off for the offscreen rasterizer so
   * the saved JPEG is the finished frame.
   */
  animate?: boolean;
};

/**
 * Portrait 1080x1350 proof card. Rasterized with Svg.toDataURL so no view-capture native module is
 * needed. Body metrics are never drawn here.
 *
 * Layout is one hero band that holds either the route map or the stats composition, so the card
 * reads as a recap on both outdoor and indoor workouts.
 */
export const WorkoutProofCard = forwardRef<Svg, Props>(function WorkoutProofCard(
  { card, activityType, width = WORKOUT_CARD_WIDTH, height = WORKOUT_CARD_HEIGHT, animate = false },
  ref,
) {
  const accent = card.accent;
  const route = card.route;
  const progress = useReveal(animate && Boolean(route));

  // The line is fitted to the hero minus the caption scrim, so the track never runs under the
  // headline number.
  const HERO = {
    ...HERO_BASE,
    height: route ? HERO_ROUTE_HEIGHT : HERO_PLAIN_HEIGHT,
  };
  const projected = route
    ? projectRoute(route, { width: HERO.width, height: HERO.height - SCRIM, padding: 56 })
    : null;
  const lineLength = projected ? pathLength(projected.points) : 0;
  const dashOffset = projected ? lineLength * (1 - progress) : 0;

  return (
    <Svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${WORKOUT_CARD_WIDTH} ${WORKOUT_CARD_HEIGHT}`}>
      <Defs>
        <LinearGradient id="field" x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor={accent.fieldTop} />
          <Stop offset="1" stopColor={accent.fieldBottom} />
        </LinearGradient>
        {/* Accent bloom behind the hero so the card is not a flat slab. */}
        <LinearGradient id="bloom" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent.accent} stopOpacity={0.22} />
          <Stop offset="1" stopColor={accent.accent} stopOpacity={0.03} />
        </LinearGradient>
        {/* Darkens the foot of the hero so the headline and stats stay legible over the map. */}
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0} />
          <Stop offset="0.58" stopColor="#000000" stopOpacity={0.32} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.86} />
        </LinearGradient>
        <LinearGradient id="line" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent.accent} stopOpacity={0.75} />
          <Stop offset="1" stopColor={accent.accent} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={WORKOUT_CARD_WIDTH} height={WORKOUT_CARD_HEIGHT} fill="url(#field)" />

      {/* Header: date left, wordmark and Bob right. */}
      <SvgText x={PAD} y={118} fill={INK.muted} fontSize={32} fontWeight="500">
        {card.dateLine}
      </SvgText>
      <SvgText
        x={WORKOUT_CARD_WIDTH - PAD}
        y={122}
        fill={accent.accent}
        fontSize={42}
        fontWeight="700"
        textAnchor="end">
        blOb
      </SvgText>
      {/*
        Corner mark, not a second hero. Sits above the hero band and opposite the date, so it never
        overlaps a number. If the asset has not decoded the card still rasterizes.
      */}
      <SvgImage
        href={BOB}
        x={WORKOUT_CARD_WIDTH - PAD - STAMP}
        y={150}
        width={STAMP}
        height={STAMP}
        opacity={0.7}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Activity + headline number. */}
      <ActivityMark type={activityType} x={PAD} y={186} color={accent.accent} />
      {/*
        Long HealthKit names such as "High Intensity Interval Training" would run under the corner
        stamp at full size, so the type steps down instead of colliding.
      */}
      <SvgText
        x={PAD + 96}
        y={246}
        fill={INK.text}
        fontSize={card.activityLabel.length > 20 ? 36 : 46}
        fontWeight="700">
        {card.activityLabel.length > 34 ? `${card.activityLabel.slice(0, 33)}\u2026` : card.activityLabel}
      </SvgText>
      <SvgText x={PAD + 96} y={296} fill={INK.faint} fontSize={30} fontWeight="500">
        {[card.timeRange, card.placeLine].filter(Boolean).join('  ·  ')}
      </SvgText>

      {/* Hero band. */}
      <Rect
        x={HERO.x}
        y={HERO.y}
        width={HERO.width}
        height={HERO.height}
        rx={HERO.radius}
        fill="url(#bloom)"
      />
      <Rect
        x={HERO.x}
        y={HERO.y}
        width={HERO.width}
        height={HERO.height}
        rx={HERO.radius}
        stroke={INK.hairline}
        strokeWidth={2}
        fill="none"
      />

      {projected ? (
        <G x={HERO.x} y={HERO.y}>
          {/* Soft under-stroke so the line reads on the darkest corner of the wash. */}
          <Path
            d={projected.path}
            stroke="#000000"
            strokeOpacity={0.35}
            strokeWidth={18}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={lineLength > 0 ? `${lineLength} ${lineLength}` : undefined}
            strokeDashoffset={dashOffset}
          />
          <Path
            d={projected.path}
            stroke="url(#line)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={lineLength > 0 ? `${lineLength} ${lineLength}` : undefined}
            strokeDashoffset={dashOffset}
          />
          {/* Start is a ring, finish is a pin: distinct at a glance in a lobby carousel. */}
          <Circle cx={projected.start.x} cy={projected.start.y} r={16} fill="#FFFFFF" />
          <Circle cx={projected.start.x} cy={projected.start.y} r={8} fill={accent.accent} />
          <PinMark x={projected.end.x - 13} y={projected.end.y - 34} color="#FFFFFF" />
        </G>
      ) : null}

      {projected ? (
        <Rect
          x={HERO.x}
          y={HERO.y}
          width={HERO.width}
          height={HERO.height}
          rx={HERO.radius}
          fill="url(#scrim)"
        />
      ) : null}

      {/*
        Headline and stats live inside the hero on both variants: over the scrim on a route card, and
        as the composition that fills the band when there is no map to draw.
      */}
      <SvgText
        x={HERO.x + 40}
        y={projected ? HERO.y + HERO.height - 162 : HERO.y + 96}
        fill={INK.faint}
        fontSize={26}
        fontWeight="700">
        {card.headline.label.toUpperCase()}
      </SvgText>
      <SvgText
        x={HERO.x + 40}
        y={projected ? HERO.y + HERO.height - 118 : HERO.y + 230}
        fill={INK.text}
        fontSize={projected ? 96 : 172}
        fontWeight="700">
        {countUp(card.headline.value, progress)}
      </SvgText>

      {card.stats.map((stat, index) => {
        const columns = Math.max(card.stats.length, 1);
        const columnWidth = (HERO.width - 80) / columns;
        const x = HERO.x + 40 + index * columnWidth;
        const labelY = projected ? HERO.y + HERO.height - 74 : HERO.y + 380;
        return (
          <G key={stat.key}>
            <SvgText x={x} y={labelY} fill={INK.faint} fontSize={24} fontWeight="700">
              {stat.label.toUpperCase()}
            </SvgText>
            <SvgText
              x={x}
              y={labelY + (projected ? 46 : 72)}
              fill={INK.text}
              fontSize={projected ? 44 : 64}
              fontWeight="700">
              {stat.value}
            </SvgText>
          </G>
        );
      })}

      {/* Heart rate band. Indoor cards only; a route card carries HR in the stats strip. */}
      {!projected && card.heartRate.sparkline ? (
        <G>
          <Rect x={HR.x} y={HR.y} width={HR.width} height={HR.height} rx={HR.radius} fill={INK.panel} />
          <G x={HR.x + 24} y={HR.y + 22}>
            <Path
              d={card.heartRate.sparkline.path}
              stroke={accent.accent}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              // The sparkline path is built against a 872x176 box; squeeze it into the slim band.
              transform={`scale(${(HR.width - 48) / 872}, ${(HR.height - 44) / 176})`}
            />
          </G>
          <SvgText x={HR.x + 24} y={HR.y + HR.height + 44} fill={INK.faint} fontSize={26} fontWeight="600">
            {`HEART RATE  ·  MIN ${card.heartRate.minLabel}  ·  MAX ${card.heartRate.maxLabel}`}
          </SvgText>
          {card.heartRate.avgLine ? (
            <SvgText
              x={HR.x + HR.width}
              y={HR.y + HR.height + 44}
              fill={INK.text}
              fontSize={28}
              fontWeight="700"
              textAnchor="end">
              {card.heartRate.avgLine}
            </SvgText>
          ) : null}
        </G>
      ) : !projected ? (
        <SvgText x={HR.x} y={HR.y + 72} fill={INK.faint} fontSize={30} fontWeight="500">
          {card.heartRate.emptyLine}
        </SvgText>
      ) : null}

      {/* Footer. */}
      <Rect x={PAD} y={1246} width={INNER} height={1} fill={INK.hairline} />
      <SvgText x={PAD} y={1300} fill={INK.muted} fontSize={28} fontWeight="500">
        {card.sourceLine}
      </SvgText>
      <SvgText
        x={WORKOUT_CARD_WIDTH - PAD}
        y={1300}
        fill={accent.accent}
        fontSize={28}
        fontWeight="600"
        textAnchor="end">
        {card.proofLine}
      </SvgText>
    </Svg>
  );
});
