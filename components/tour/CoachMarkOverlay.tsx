import { useState, type ReactNode } from 'react';
import { Platform, Pressable, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import type { TourPlacement } from '@/lib/tour';
import { TAB_BAR_PEEK, tabBarLift, THEME, themeShadow } from '@/lib/theme';

const MIN_HOLE = 44;
const HOLE_PAD = 6;
const TOOLTIP_GAP = 10;
const DIM = 'rgba(16, 19, 18, 0.58)';

type CoachMarkOverlayProps = {
  hole: LayoutRectangle | null;
  placement: TourPlacement;
  index: number;
  total: number;
  title: string;
  body: ReactNode;
  titleAccessory?: ReactNode;
  nextLabel: string;
  backDisabled?: boolean;
  onBack: () => void;
  onNext: () => void;
  footer?: ReactNode;
  topReserve?: number;
  bottomReserve?: number;
};

export function CoachMarkOverlay({
  hole,
  placement,
  index,
  total,
  title,
  body,
  titleAccessory,
  nextLabel,
  backDisabled,
  onBack,
  onNext,
  footer,
  topReserve: topReserveProp,
  bottomReserve: bottomReserveProp,
}: CoachMarkOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
  const tooltipW = Math.min(300, screenW - 24);
  const tooltipH = tooltipSize.height || 188;
  const bottomReserve = bottomReserveProp ?? tabBarLift(insets.bottom) + TAB_BAR_PEEK;
  const pos = placeTooltip({
    hole,
    placement,
    tooltipW,
    tooltipH,
    screenW,
    screenH,
    bottomReserve,
    topReserve: topReserveProp ?? Math.max(insets.top, 8),
  });

  return (
    <View
      pointerEvents="auto"
      style={{
        position: Platform.OS === 'web' ? 'fixed' : 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 4000,
        elevation: 4000,
        ...(Platform.OS === 'web' ? ({ isolation: 'isolate' } as object) : null),
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
            backgroundColor: Platform.OS === 'web' ? 'rgba(247, 247, 245, 0.02)' : 'transparent',
          }}
        />
      ) : null}
      {hole ? (
        <View
          pointerEvents="none"
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
          zIndex: 2,
          elevation: 8,
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
              {index + 1} / {total}
            </AppText>
            <View className="mt-0.5 flex-row items-center" style={{ gap: 6 }}>
              {titleAccessory}
              <AppText className="flex-1 text-[16px] font-extrabold text-charcoal">{title}</AppText>
            </View>
          </View>
        </View>
        {typeof body === 'string' ? (
          <AppText className="mt-2 text-[13px] leading-5 text-muted">{body}</AppText>
        ) : (
          body
        )}
        <View className="mt-3 flex-row" style={{ gap: 8 }}>
          <TourBtn label="Back" muted disabled={backDisabled} onPress={onBack} />
          <TourBtn label={nextLabel} onPress={onNext} />
        </View>
        {footer}
      </View>
    </View>
  );
}

export function expandHole(
  rect: LayoutRectangle | null,
  screenW: number,
  screenH: number,
  bounds?: { minTop?: number; maxBottom?: number },
): LayoutRectangle | null {
  if (!rect) {
    return null;
  }
  const width = Math.max(rect.width + HOLE_PAD * 2, MIN_HOLE);
  const height = Math.max(rect.height + HOLE_PAD * 2, MIN_HOLE);
  const minTop = bounds?.minTop ?? 4;
  const maxBottom = bounds?.maxBottom ?? screenH - 4;
  const x = clamp(rect.x + rect.width / 2 - width / 2, 4, screenW - width - 4);
  const y = clamp(rect.y + rect.height / 2 - height / 2, minTop, Math.max(minTop, maxBottom - height));
  return { x, y, width, height };
}

function DimWithHole({ hole }: { hole: LayoutRectangle | null }) {
  if (!hole) {
    return (
      <View
        pointerEvents="auto"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: DIM }}
      />
    );
  }
  return (
    <>
      <View
        pointerEvents="auto"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(hole.y, 0),
          backgroundColor: DIM,
        }}
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
  const usableMid = (input.topReserve + (input.screenH - input.bottomReserve)) / 2;
  const fieldIsLow = input.hole.y + input.hole.height / 2 > usableMid;
  const preferBelow = input.placement === 'below' && !fieldIsLow;

  if (preferBelow) {
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
