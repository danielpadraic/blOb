import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image } from 'expo-image';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { chipRowBottom } from '@/lib/checkin/cameraChrome';
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
  /** Live preview is up. Chips sit above the shutter. */
  cameraLive?: boolean;
  reviewOpen?: boolean;
  reviewUri?: string | null;
  caption?: string;
  onCaption?: (value: string) => void;
  notice?: string | null;
  canSend?: boolean;
  busy?: boolean;
  onSlot: (id: string) => void;
  onRetake?: () => void;
  onUse?: () => void;
  onSend?: () => void;
  children?: ReactNode;
};

export function CheckinCameraChrome({
  slots,
  cameraLive = false,
  reviewOpen = false,
  reviewUri,
  caption = '',
  onCaption,
  notice,
  canSend,
  busy,
  onSlot,
  onRetake,
  onUse,
  onSend,
  children,
}: CheckinCameraChromeProps) {
  const insets = useSafeAreaInsets();
  const reviewing = reviewOpen;
  const [captionHeight, setCaptionHeight] = useState(44);
  const chips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
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
      {canSend && !reviewing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={busy}
          onPress={onSend}
          style={pill}>
          <AppText style={{ color: THEME.primaryForeground, fontWeight: '800' }}>{busy ? 'Sending…' : 'Send'}</AppText>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: THEME.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {reviewing && reviewUri ? (
            <Image
              source={{ uri: reviewUri }}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              contentFit="cover"
              accessibilityLabel="Your photo"
            />
          ) : reviewing ? null : (
            children
          )}
        </View>
        {notice ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: Math.max(insets.top, 12) + 44,
              left: 16,
              right: 16,
              alignItems: 'center',
            }}>
            <AppText numberOfLines={2} style={{ color: THEME.primaryForeground, fontWeight: '700', textAlign: 'center' }}>
              {notice}
            </AppText>
          </View>
        ) : null}
        {reviewing ? (
          <View style={{ marginTop: 'auto', paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 12 }}>
            {chips}
            <TextInput
              value={caption}
              onChangeText={onCaption}
              placeholder="Caption"
              placeholderTextColor={THEME.muted}
              multiline
              accessibilityLabel="Caption"
              onContentSizeChange={(event) => {
                const next = Math.min(160, Math.max(44, event.nativeEvent.contentSize.height));
                setCaptionHeight(next);
              }}
              style={{
                minHeight: 44,
                height: Math.max(44, captionHeight),
                maxHeight: 160,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: THEME.surface,
                color: THEME.ink,
                fontSize: 16,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Retake" onPress={onRetake} style={[pill, { flex: 1, backgroundColor: 'rgba(16,19,18,0.72)' }]}>
                <AppText style={{ color: THEME.primaryForeground, fontWeight: '800', textAlign: 'center' }}>Retake</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Use" onPress={onUse} style={[pill, { flex: 1 }]}>
                <AppText style={{ color: THEME.primaryForeground, fontWeight: '800', textAlign: 'center' }}>Use</AppText>
              </Pressable>
            </View>
            {canSend ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy} onPress={onSend} style={pill}>
                <AppText style={{ color: THEME.primaryForeground, fontWeight: '800' }}>{busy ? 'Sending…' : 'Send'}</AppText>
              </Pressable>
            ) : null}
          </View>
        ) : cameraLive ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: chipRowBottom(insets.bottom),
            }}>
            {chips}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
            {chips}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const pill = {
  alignSelf: 'flex-start' as const,
  backgroundColor: THEME.primary,
  borderRadius: 999,
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.35)',
};
