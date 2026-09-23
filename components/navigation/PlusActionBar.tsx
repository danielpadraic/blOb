import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { asLoggableList } from '@/lib/loggable';
import { copy } from '@/lib/copy';
import { TAB_BAR_GUTTER, TAB_BAR_HEIGHT, THEME, themeShadow } from '@/lib/theme';

export type QuickActionId =
  | 'log'
  | 'lift'
  | 'timer'
  | 'counter'
  | 'create'
  | 'join'
  | 'post'
  | 'story'
  | 'reel'
  | 'coins'
  | 'callout';

type PlusPanel = 'root' | 'post';

type PlusActionBarProps = {
  visible: boolean;
  panel?: PlusPanel;
  onPanelChange?: (panel: PlusPanel) => void;
  loggable?: LoggableChallenge | LoggableChallenge[] | null;
  onClose: () => void;
  onAction: (id: QuickActionId, challenge?: LoggableChallenge) => void;
};

export function PlusActionBar({
  visible,
  panel,
  onPanelChange,
  loggable,
  onClose,
  onAction,
}: PlusActionBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tourLocked = Boolean(useTourOptional()?.active);
  const [inner, setInner] = useState<PlusPanel>('root');
  const step = panel ?? inner;
  const loggables = asLoggableList(loggable);
  const only = loggables.length === 1 ? loggables[0] : null;
  const tabClear = TAB_BAR_HEIGHT + Math.max(insets.bottom, TAB_BAR_GUTTER) + 6;
  const barWidth = Math.min(width - 24, 430);

  useEffect(() => {
    if (!visible) {
      setInner('root');
      onPanelChange?.('root');
    }
  }, [onPanelChange, visible]);

  function setStep(next: PlusPanel) {
    setInner(next);
    onPanelChange?.(next);
  }

  function pickLog(challenge?: LoggableChallenge) {
    const picked = challenge ?? only ?? undefined;
    if (!picked) {
      return;
    }
    onAction('log', picked);
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} dim zIndex={120}>
      <View
        pointerEvents="box-none"
        style={{
          width: '100%',
          alignItems: 'center',
          paddingBottom: tabClear,
          paddingHorizontal: 12,
        }}>
        <TourAnchor id={step === 'post' ? 'tour-plus-post' : 'tour-plus-root'}>
        <View style={{ width: barWidth, gap: 8 }}>
          {step === 'post' ? (
            <View style={barStyle}>
              <BarButton
                tourId="tour-plus-wave"
                label={copy('wave.noun')}
                onPress={() => {
                  if (!tourLocked) {
                    onAction('story');
                  }
                }}
              />
              <BarDivider />
              <BarButton
                tourId="tour-plus-round"
                label={copy('round.noun')}
                onPress={() => {
                  if (!tourLocked) {
                    onAction('reel');
                  }
                }}
              />
              <BarDivider />
              <BarButton
                tourId="tour-plus-feed"
                label="Feed"
                onPress={() => {
                  if (!tourLocked) {
                    onAction('post');
                  }
                }}
              />
            </View>
          ) : (
            <>
              <View style={barStyle}>
                <BarButton
                  tourId="tour-plus-checkin"
                  label="Check In"
                  onPress={() => {
                    if (tourLocked) {
                      return;
                    }
                    if (loggables.length === 1) {
                      pickLog(loggables[0]);
                      return;
                    }
                    onAction('log');
                  }}
                />
                <BarDivider />
                <BarButton
                  tourId="tour-plus-post-btn"
                  label="Post"
                  onPress={() => {
                    if (!tourLocked) {
                      setStep('post');
                    }
                  }}
                />
              </View>
              <View style={barStyle}>
                <BarButton
                  tourId="tour-plus-lift"
                  glyph={GLYPH.lift}
                  label="Lift"
                  onPress={() => {
                    if (!tourLocked) {
                      onAction('lift');
                    }
                  }}
                />
                <BarDivider />
                <BarButton
                  tourId="tour-plus-timer"
                  glyph={GLYPH.clock}
                  label="Timer"
                  onPress={() => {
                    if (!tourLocked) {
                      onAction('timer');
                    }
                  }}
                />
                <BarDivider />
                <BarButton
                  glyph={GLYPH.counter}
                  label="Counter"
                  onPress={() => {
                    if (!tourLocked) {
                      onAction('counter');
                    }
                  }}
                />
              </View>
            </>
          )}
        </View>
        </TourAnchor>
      </View>
    </ChromeOverlay>
  );
}

const barStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: THEME.surface,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: THEME.border,
  overflow: 'hidden' as const,
  ...themeShadow('card'),
};

function BarDivider() {
  return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: THEME.border }} />;
}

function BarButton({
  label,
  onPress,
  disabled,
  tourId,
  glyph,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tourId?: string;
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
}) {
  const tour = useTourOptional();
  const lit = Boolean(tour?.active && tourId && tour.targetId === tourId);
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: glyph ? 8 : 0,
        gap: glyph ? 4 : 0,
        opacity: disabled ? 0.38 : 1,
        backgroundColor: lit ? THEME.accentSoft : undefined,
      }}>
      {glyph ? <Glyph name={glyph} color={THEME.textPrimary} size={16} /> : null}
      <AppText numberOfLines={1} className="text-[15px] font-extrabold text-charcoal">
        {label}
      </AppText>
    </Pressable>
  );
  if (!tourId) {
    return button;
  }
  return (
    <TourAnchor id={tourId} style={{ flex: 1 }}>
      {button}
    </TourAnchor>
  );
}
