import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { asLoggableList } from '@/lib/loggable';
import { copy } from '@/lib/copy';
import { TAB_BAR_GUTTER, TAB_BAR_HEIGHT, THEME, themeShadow } from '@/lib/theme';

export type QuickActionId = 'log' | 'create' | 'join' | 'post' | 'story' | 'reel' | 'coins' | 'callout';

type PlusActionBarProps = {
  visible: boolean;
  loggable?: LoggableChallenge | LoggableChallenge[] | null;
  onClose: () => void;
  onAction: (id: QuickActionId, challenge?: LoggableChallenge) => void;
};

export function PlusActionBar({ visible, loggable, onClose, onAction }: PlusActionBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<'root' | 'post' | 'log'>('root');
  const loggables = asLoggableList(loggable);
  const only = loggables.length === 1 ? loggables[0] : null;
  const tabClear = TAB_BAR_HEIGHT + Math.max(insets.bottom, TAB_BAR_GUTTER) + 6;
  const barWidth = Math.min(width - 24, 430);

  useEffect(() => {
    if (!visible) {
      setStep('root');
    }
  }, [visible]);

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
        {step === 'log' ? (
          <View
            style={{
              width: barWidth,
              marginBottom: 8,
              backgroundColor: THEME.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: THEME.border,
              overflow: 'hidden',
              ...themeShadow('card'),
            }}>
            {loggables.map((challenge, index) => (
              <Pressable
                key={challenge.id}
                accessibilityRole="button"
                accessibilityLabel={challenge.title}
                onPress={() => pickLog(challenge)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: THEME.border,
                }}>
                <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                  {challenge.title}
                </AppText>
                {challenge.taskLabel ? (
                  <AppText className="text-[12px] text-muted" numberOfLines={1}>
                    {challenge.taskLabel}
                  </AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
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
              <BarButton label={copy('wave.noun')} onPress={() => onAction('story')} />
              <BarDivider />
              <BarButton label={copy('round.noun')} onPress={() => onAction('reel')} />
              <BarDivider />
              <BarButton label="Feed" onPress={() => onAction('post')} />
            </>
          ) : (
            <>
              <BarButton
                label="Check In"
                disabled={loggables.length === 0}
                onPress={() => {
                  if (loggables.length === 0) {
                    return;
                  }
                  if (loggables.length === 1) {
                    pickLog(loggables[0]);
                    return;
                  }
                  setStep((current) => (current === 'log' ? 'root' : 'log'));
                }}
              />
              <BarDivider />
              <BarButton label="Post" onPress={() => setStep('post')} />
            </>
          )}
        </View>
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
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
        paddingHorizontal: 8,
        opacity: disabled ? 0.38 : 1,
      }}>
      <AppText className="text-[15px] font-extrabold text-charcoal">{label}</AppText>
    </Pressable>
  );
}
