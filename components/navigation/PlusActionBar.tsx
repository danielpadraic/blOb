import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { asLoggableList } from '@/lib/loggable';
import { copy } from '@/lib/copy';
import { TAB_BAR_GUTTER, TAB_BAR_HEIGHT, THEME, themeShadow } from '@/lib/theme';

export type QuickActionId =
  | 'log'
  | 'lift'
  | 'timer'
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
        <View
          style={{
            width: barWidth,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: THEME.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: THEME.border,
            overflow: 'hidden',
            ...themeShadow('card'),
          }}>
          {step === 'post' ? (
            <>
              <BarButton tourId="tour-plus-wave" label={copy('wave.noun')} onPress={() => onAction('story')} />
              <BarDivider />
              <BarButton tourId="tour-plus-round" label={copy('round.noun')} onPress={() => onAction('reel')} />
              <BarDivider />
              <BarButton tourId="tour-plus-feed" label="Feed" onPress={() => onAction('post')} />
            </>
          ) : (
            <>
              <BarButton
                tourId="tour-plus-checkin"
                label="Check In"
                onPress={() => {
                  if (loggables.length === 1) {
                    pickLog(loggables[0]);
                    return;
                  }
                  onAction('log');
                }}
              />
              <BarDivider />
              <BarButton tourId="tour-plus-post" label="Post" onPress={() => setStep('post')} />
              <BarDivider />
              <BarButton tourId="tour-plus-lift" label="Lift" onPress={() => onAction('lift')} />
              <BarDivider />
              <BarButton tourId="tour-plus-timer" label="Timer" onPress={() => onAction('timer')} />
            </>
          )}
        </View>
        </TourAnchor>
      </View>
    </ChromeOverlay>
  );
}

function BarDivider() {
  return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: THEME.border }} />;
}

function BarButton({
  label,
  onPress,
  disabled,
  tourId,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tourId?: string;
}) {
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
        // Four actions share this row on a phone, so the label truncates rather than wrapping —
        // a second line would push the bar taller than the tab bar it floats above.
        paddingHorizontal: 6,
        opacity: disabled ? 0.38 : 1,
      }}>
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
