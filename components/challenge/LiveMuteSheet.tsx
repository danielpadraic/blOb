import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  LIVE_MUTE_OPTIONS,
  LIVE_MUTE_REMINDER_LINE,
  asLiveMute,
  type LiveMute,
} from '@/lib/livePush';
import { THEME, themeShadow } from '@/lib/theme';

export function LiveMuteSheet({
  visible,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: LiveMute;
  onClose: () => void;
  onSave: (next: LiveMute) => void;
}) {
  const current = asLiveMute(value);

  return (
    <ChromeOverlay visible={visible} onClose={onClose}>
      <Pressable
        className="px-5 pb-10 pt-6"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          ...themeShadow(),
        }}
        onPress={(event) => event.stopPropagation()}>
        <AppText className="text-2xl font-bold" style={{ color: THEME.textPrimary }}>
          Live notifications
        </AppText>
        <AppText className="mt-2 text-[14px] leading-5" style={{ color: THEME.textMuted }}>
          This challenge only. Friend requests and tags outside Live stay on.
        </AppText>
        <View className="mt-5 gap-2">
          {LIVE_MUTE_OPTIONS.map((option) => {
            const selected = option.value === current;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSave(option.value);
                  onClose();
                }}
                style={{
                  minHeight: 56,
                  borderRadius: THEME.radius,
                  borderWidth: 1,
                  borderColor: selected ? THEME.accent : THEME.border,
                  backgroundColor: selected ? THEME.accentSoft : THEME.surface,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  justifyContent: 'center',
                }}>
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.textPrimary }}>
                  {option.label}
                </AppText>
                <AppText className="mt-0.5 text-[13px] leading-5" style={{ color: THEME.textMuted }}>
                  {option.body}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText className="mt-4 text-[13px] leading-5" style={{ color: THEME.textMuted }}>
          {LIVE_MUTE_REMINDER_LINE}
        </AppText>
      </Pressable>
    </ChromeOverlay>
  );
}

type MutePublish = {
  canMute: boolean;
  liveMute: LiveMute;
  open: () => void;
};

let mutePublish: MutePublish = { canMute: false, liveMute: 'all', open: () => {} };
const muteListeners = new Set<() => void>();

export function publishLiveMuteControl(next: MutePublish) {
  mutePublish = next;
  muteListeners.forEach((listener) => listener());
}

export function LiveAlertsButton() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const listener = () => setRev((value) => value + 1);
    muteListeners.add(listener);
    listener();
    return () => {
      muteListeners.delete(listener);
    };
  }, []);

  if (!mutePublish.canMute) {
    return null;
  }

  const mute = asLiveMute(mutePublish.liveMute);
  const off = mute === 'off';
  const label =
    mute === 'off' ? 'Live notifications, Off' : mute === 'mentions' ? 'Live notifications, Mentions only' : 'Live notifications, All';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={mutePublish.open}
      style={{
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
      }}>
      <Glyph name={GLYPH.bell} color={off ? THEME.textMuted : THEME.accent} size={18} />
    </Pressable>
  );
}
