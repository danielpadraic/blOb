import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export type CheckinStripSlot = {
  id: string;
  label: string;
  uri: string | null;
  open: boolean;
  upload: 'up' | 'fail' | null;
};

type CheckinCameraChromeProps = {
  slots: CheckinStripSlot[];
  snapUri?: string | null;
  postedLine?: string | null;
  openLabel?: string | null;
  canSend?: boolean;
  busy?: boolean;
  onSlot: (id: string) => void;
  onReturnToOpen?: () => void;
  onSend?: () => void;
  children?: ReactNode;
};

export function CheckinCameraChrome({
  slots,
  snapUri,
  postedLine,
  openLabel,
  canSend,
  busy,
  onSlot,
  onReturnToOpen,
  onSend,
  children,
}: CheckinCameraChromeProps) {
  return (
    <View style={{ flex: 1, backgroundColor: THEME.primary }}>
      <View style={{ flex: 1 }}>{children}</View>
      {snapUri ? (
        <Image
          source={{ uri: snapUri }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          contentFit="cover"
          accessibilityLabel="Your photo"
        />
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, gap: 8 }}>
        {postedLine ? (
          <AppText style={{ color: THEME.primaryForeground, fontWeight: '700' }}>{postedLine}</AppText>
        ) : null}
        {postedLine && openLabel ? (
          <Pressable accessibilityRole="button" onPress={onReturnToOpen} style={sendButton}>
            <AppText style={{ color: THEME.primary, fontWeight: '800' }}>{openLabel}</AppText>
          </Pressable>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {slots.map((slot) => (
            <Pressable
              key={slot.id}
              accessibilityRole="button"
              accessibilityLabel={slot.uri ? `Retake ${slot.label}` : slot.label}
              onPress={() => onSlot(slot.id)}
              style={{
                width: 72,
                height: 72,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: slot.open ? 2 : 1,
                borderColor: slot.open ? THEME.accentBright : 'rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(16,19,18,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {slot.uri ? (
                <Image source={{ uri: slot.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <AppText style={{ color: THEME.primaryForeground, fontWeight: '800', fontSize: 12 }}>{slot.label}</AppText>
              )}
              {slot.upload === 'up' ? (
                <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' }}>
                  <View style={{ width: '45%', height: 3, borderRadius: 2, backgroundColor: THEME.accentBright }} />
                </View>
              ) : null}
              {slot.upload === 'fail' ? (
                <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, height: 3, borderRadius: 2, backgroundColor: THEME.danger }} />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
        {canSend ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={onSend} style={[sendButton, { backgroundColor: THEME.primaryForeground }]}>
            <AppText style={{ color: THEME.primary, fontWeight: '800' }}>{busy ? 'Sending…' : 'Send'}</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const sendButton = {
  alignSelf: 'flex-start' as const,
  backgroundColor: THEME.primaryForeground,
  borderRadius: 999,
  paddingHorizontal: 16,
  paddingVertical: 10,
};
