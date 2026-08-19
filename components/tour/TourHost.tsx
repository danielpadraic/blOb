import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { useTour } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { completeTutorial } from '@/lib/legal';
import { TOUR_STEPS, type TourPlacement } from '@/lib/tour';
import { TAB_BAR_HEIGHT, THEME, themeShadow } from '@/lib/theme';

const MIN_HOLE = 44;
const HOLE_PAD = 6;
const TOOLTIP_GAP = 10;
const DIM = 'rgba(16, 19, 18, 0.58)';

type TourHostProps = {
  onFinished: () => void;
};

export function TourHost({ onFinished }: TourHostProps) {
  const tour = useTour();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
  const step = TOUR_STEPS[index];
  const rawRect = tour.rectFor(step?.target ?? null);
  const hole = expandHole(rawRect, screenW, screenH);
  const bump = tour.bump;
  const setTargetId = tour.setTargetId;
  const scrollHomeToTop = tour.scrollHomeToTop;
  const stop = tour.stop;

  useEffect(() => {
    setIndex(0);
    setTooltipSize({ width: 0, height: 0 });
  }, [tour.runId]);

  useEffect(() => {
    if (!tour.active) {
      return;
    }
    router.navigate('/feed');
  }, [router, tour.active]);

  useEffect(() => {
    if (!tour.active || !step) {
      setTargetId(null);
      return;
    }
    setTargetId(step.target);
    if (step.target === 'tour-official') {
      scrollHomeToTop();
    }
    const wait = step.target === 'tour-official' ? 380 : 80;
    const handle = setTimeout(() => bump(), wait);
    return () => clearTimeout(handle);
  }, [bump, scrollHomeToTop, setTargetId, step, tour.active]);

  useEffect(() => {
    if (!tour.active || !step?.target || rawRect) {
      return;
    }
    const poll = setInterval(() => bump(), 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 2200);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bump, rawRect, step?.target, tour.active]);

  const finish = useCallback(async () => {
    try {
      await completeTutorial();
    } catch {
      // Do not block Home if the write fails this session.
    }
    stop();
    onFinished();
  }, [onFinished, stop]);

  if (!tour.active || !step) {
    return null;
  }

  const tooltipW = Math.min(300, screenW - 24);
  const tooltipH = tooltipSize.height || 168;
  const pos = placeTooltip({
    hole,
    placement: step.placement,
    tooltipW,
    tooltipH,
    screenW,
    screenH,
    bottomReserve: TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 8,
    topReserve: Math.max(insets.top, 8),
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 400,
        elevation: 400,
      }}>
      <DimWithHole hole={hole} />
      {hole ? (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute',
            top: hole.y,
            left: hole.x,
            width: hole.width,
            height: hole.height,
            borderRadius: holeRadius(hole),
            borderWidth: 2,
            borderColor: THEME.accent,
            backgroundColor: 'transparent',
          }}
        />
      ) : null}
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width === tooltipSize.width && height === tooltipSize.height) {
            return;
          }
          setTooltipSize({ width, height });
        }}
        style={{
          position: 'absolute',
          top: pos.top,
          left: pos.left,
          width: tooltipW,
          backgroundColor: THEME.surface,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: THEME.border,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10,
          overflow: 'visible',
          ...themeShadow('card'),
        }}>
        {pos.caret === 'top' ? <Caret align={pos.caretAlign} side="top" /> : null}
        {pos.caret === 'bottom' ? <Caret align={pos.caretAlign} side="bottom" /> : null}
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <BlobMascot variant="wave" size={44} motion="float" />
          <View className="flex-1">
            <AppText className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {index + 1} / {TOUR_STEPS.length}
            </AppText>
            <View className="mt-0.5 flex-row items-center" style={{ gap: 6 }}>
              {step.id === 'coins' ? <CurrencyMark currency="coins" size={16} /> : null}
              {step.id === 'money' ? <CurrencyMark currency="bucks" size={16} accessibilityLabel="$" /> : null}
              <AppText className="flex-1 text-[16px] font-extrabold text-charcoal">{step.title}</AppText>
            </View>
          </View>
        </View>
        <AppText className="mt-2 text-[13px] leading-5 text-muted">{step.body}</AppText>
        <View className="mt-3 flex-row" style={{ gap: 8 }}>
          <TourBtn
            label="Back"
            muted
            disabled={index === 0}
            onPress={() => setIndex((current) => Math.max(0, current - 1))}
          />
          <TourBtn
            label={index === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
            onPress={() => {
              if (index === TOUR_STEPS.length - 1) {
                void finish();
                return;
              }
              setIndex((current) => current + 1);
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
          onPress={() => void finish()}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-center text-sm font-semibold" style={{ color: THEME.accent }}>
            Skip tour
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function DimWithHole({ hole }: { hole: LayoutRectangle | null }) {
  if (!hole) {
    return <View pointerEvents="auto" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: DIM }} />;
  }
  return (
    <>
      <View
        pointerEvents="auto"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(hole.y, 0), backgroundColor: DIM }}
      />
      <View
        pointerEvents="auto"
        style={{
          position: 'absolute',
          top: hole.y,
          left: 0,
          width: Math.max(hole.x, 0),
          height: hole.height,
          backgroundColor: DIM,
        }}
      />
      <View
        pointerEvents="auto"
        style={{
          position: 'absolute',
          top: hole.y,
          left: hole.x + hole.width,
          right: 0,
          height: hole.height,
          backgroundColor: DIM,
        }}
      />
      <View
        pointerEvents="auto"
        style={{
          position: 'absolute',
          top: hole.y + hole.height,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: DIM,
        }}
      />
    </>
  );
}

function TourBtn({
  label,
  onPress,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: muted ? THEME.surface : THEME.primary,
        borderWidth: muted ? 1 : 0,
        borderColor: THEME.border,
        opacity: disabled ? 0.38 : 1,
      }}>
      <AppText
        className="text-[14px] font-semibold"
        style={{ color: muted ? THEME.textPrimary : THEME.primaryForeground }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Caret({ align, side }: { align: number; side: 'top' | 'bottom' }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        [side === 'top' ? 'top' : 'bottom']: -6,
        left: align,
        width: 12,
        height: 12,
        backgroundColor: THEME.surface,
        borderLeftWidth: side === 'top' ? 1 : 0,
        borderTopWidth: side === 'top' ? 1 : 0,
        borderRightWidth: side === 'bottom' ? 1 : 0,
        borderBottomWidth: side === 'bottom' ? 1 : 0,
        borderColor: THEME.border,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}

function expandHole(
  rect: LayoutRectangle | null,
  screenW: number,
  screenH: number,
): LayoutRectangle | null {
  if (!rect) {
    return null;
  }
  const width = Math.max(rect.width + HOLE_PAD * 2, MIN_HOLE);
  const height = Math.max(rect.height + HOLE_PAD * 2, MIN_HOLE);
  const x = clamp(rect.x + rect.width / 2 - width / 2, 4, screenW - width - 4);
  const y = clamp(rect.y + rect.height / 2 - height / 2, 4, screenH - height - 4);
  return { x, y, width, height };
}

function holeRadius(hole: LayoutRectangle) {
  return Math.min(16, hole.width / 2, hole.height / 2);
}

function placeTooltip(input: {
  hole: LayoutRectangle | null;
  placement: TourPlacement;
  tooltipW: number;
  tooltipH: number;
  screenW: number;
  screenH: number;
  bottomReserve: number;
  topReserve: number;
}): { top: number; left: number; caret: 'top' | 'bottom' | null; caretAlign: number } {
  const left = input.hole
    ? clamp(input.hole.x + input.hole.width / 2 - input.tooltipW / 2, 12, input.screenW - input.tooltipW - 12)
    : clamp((input.screenW - input.tooltipW) / 2, 12, input.screenW - input.tooltipW - 12);

  function caretAlign(forLeft: number) {
    if (!input.hole) {
      return input.tooltipW / 2 - 6;
    }
    return clamp(input.hole.x + input.hole.width / 2 - forLeft - 6, 16, input.tooltipW - 28);
  }

  if (!input.hole || input.placement === 'center-low') {
    const top = clamp(
      input.screenH * 0.58 - input.tooltipH / 2,
      input.topReserve + 8,
      input.screenH - input.bottomReserve - input.tooltipH,
    );
    return { top, left, caret: input.hole ? 'top' : null, caretAlign: caretAlign(left) };
  }

  const below = input.hole.y + input.hole.height + TOOLTIP_GAP;
  const above = input.hole.y - input.tooltipH - TOOLTIP_GAP;
  const belowFits = below + input.tooltipH <= input.screenH - input.bottomReserve;
  const aboveFits = above >= input.topReserve;

  if (input.placement === 'below') {
    if (belowFits) {
      return { top: below, left, caret: 'top', caretAlign: caretAlign(left) };
    }
    if (aboveFits) {
      return { top: above, left, caret: 'bottom', caretAlign: caretAlign(left) };
    }
  } else {
    if (aboveFits) {
      return { top: above, left, caret: 'bottom', caretAlign: caretAlign(left) };
    }
    if (belowFits) {
      return { top: below, left, caret: 'top', caretAlign: caretAlign(left) };
    }
  }

  return {
    top: clamp(below, input.topReserve, input.screenH - input.bottomReserve - input.tooltipH),
    left,
    caret: 'top',
    caretAlign: caretAlign(left),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
