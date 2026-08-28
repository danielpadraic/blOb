import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useMyCircles, useShareChallengeToCircle } from '@/hooks/useCircles';
import { circleDisplayName } from '@/lib/circles';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function CircleShareSheet({
  visible,
  challengeId,
  challengeTitle,
  onClose,
  onSent,
}: {
  visible: boolean;
  challengeId: string;
  challengeTitle: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const circles = useMyCircles();
  const share = useShareChallengeToCircle();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
  const mine = circles.data ?? [];

  const chosen = useMemo(
    () => mine.filter((row) => selected.has(row.id)),
    [mine, selected],
  );

  function close() {
    if (share.isPending) {
      return;
    }
    setSelected(new Set());
    setCaption('');
    onClose();
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function send() {
    if (chosen.length === 0) {
      Alert.alert('Pick a Circle', 'Select at least one Circle.');
      return;
    }
    try {
      for (const row of chosen) {
        await share.mutateAsync({
          circleId: row.id,
          challengeId,
          caption,
        });
      }
      close();
      onSent?.();
    } catch (error) {
      Alert.alert('Couldn’t share that', getErrorMessage(error));
    }
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <View
        className="max-h-[88%] px-5 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: 16,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-xl font-bold text-charcoal">{copy('circles.shareToCircle')}</AppText>
        <AppText className="mt-1 mb-3 text-muted">{challengeTitle}</AppText>
        <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
          {mine.length === 0 ? (
            <AppText className="text-[14px] text-muted">Join a Circle first.</AppText>
          ) : (
            mine.map((row, index) => {
              const on = selected.has(row.id);
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(row.id)}
                  className="flex-row items-center px-3 py-3"
                  style={{
                    minHeight: 44,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: THEME.border,
                    backgroundColor: on ? THEME.circleSoft : THEME.surface,
                    borderRadius: index === 0 ? THEME.radius : 0,
                  }}>
                  <View className="flex-1">
                    <AppText className="font-semibold text-charcoal">{circleDisplayName(row)}</AppText>
                    <AppText className="text-sm text-muted">{row.focus}</AppText>
                  </View>
                  <View
                    className="h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      borderWidth: 1,
                      borderColor: on ? THEME.circle : THEME.border,
                      backgroundColor: on ? THEME.circle : THEME.surface,
                    }}>
                    {on ? (
                      <AppText className="text-[12px] font-extrabold" style={{ color: THEME.primaryForeground }}>
                        ✓
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <View className="mt-3">
          <Input
            value={caption}
            onChangeText={setCaption}
            placeholder={copy('circles.shareCaption')}
            grow
            growMaxLines={5}
          />
        </View>
        <View className="mt-4 gap-2">
          <Button
            title={copy('circles.shareSend')}
            loading={share.isPending}
            disabled={chosen.length === 0}
            onPress={() => void send()}
          />
          <Button title="Back" variant="ghost" onPress={close} disabled={share.isPending} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
