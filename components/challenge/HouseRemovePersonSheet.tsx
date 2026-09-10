import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { officialOpsRemoveError, type OfficialOpsRemoveMode } from '@/lib/officialOps';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function HouseRemovePersonSheet({
  visible,
  challengeId,
  userId,
  displayName,
  disabled = false,
  onClose,
}: {
  visible: boolean;
  challengeId: string;
  userId: string;
  displayName: string;
  disabled?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<OfficialOpsRemoveMode>('out_of_pot');

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('official_remove_participant', {
        p_challenge_id: challengeId,
        p_user_id: userId,
        p_mode: mode,
      });
      if (error) {
        throw new Error(officialOpsRemoveError(getErrorMessage(error)));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      close();
    },
  });

  function close() {
    if (remove.isPending) {
      return;
    }
    setMode('out_of_pot');
    remove.reset();
    onClose();
  }

  return (
    <ChromeOverlay visible={visible} onClose={remove.isPending ? undefined : close}>
      <Pressable
        className="px-5 pb-8 pt-5"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
        }}
        onPress={(event) => event.stopPropagation()}>
        <AppText className="text-2xl font-bold text-charcoal">{copy('house.remove')}</AppText>
        <AppText className="mt-2 text-muted">
          {mode === 'leave_room'
            ? copy('house.leaveRoomConfirm', 'gentle', { name: displayName })
            : copy('house.outOfPotConfirm', 'gentle', { name: displayName })}
        </AppText>
        {disabled ? (
          <AppText className="mt-3 text-sm text-coral-dark">{copy('house.settled')}</AppText>
        ) : null}
        {remove.error ? (
          <AppText className="mt-3 text-sm text-coral-dark">
            {officialOpsRemoveError(getErrorMessage(remove.error))}
          </AppText>
        ) : null}
        <View className="mt-4 gap-1">
          {(['out_of_pot', 'leave_room'] as const).map((next) => (
            <Pressable
              key={next}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === next }}
              onPress={() => setMode(next)}
              className="justify-center px-3"
              style={{
                minHeight: 44,
                borderRadius: 14,
                backgroundColor: mode === next ? THEME.accentSoft : THEME.surface,
                borderWidth: 1,
                borderColor: mode === next ? THEME.accent : THEME.border,
              }}>
              <AppText className="text-[15px] font-semibold text-charcoal">
                {copy(next === 'leave_room' ? 'house.leaveRoom' : 'house.outOfPot')}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View className="mt-5 gap-2">
          <Button
            title={copy('house.remove')}
            size="lg"
            loading={remove.isPending}
            disabled={disabled}
            onPress={() => remove.mutate()}
          />
          <Button title="Close" variant="ghost" disabled={remove.isPending} onPress={close} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}
