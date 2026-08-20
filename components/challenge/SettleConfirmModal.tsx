import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { isUnlimitedChallenge } from '@/lib/challenges';
import type { Challenge } from '@/lib/types';
import { THEME } from '@/lib/theme';
import { formatWallet } from '@/lib/currency';

type SettleConfirmModalProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  mode?: 'judge' | 'settle';
  completerCount?: number | null;
  onClose: () => void;
  onConfirm: () => void;
};

function structureLabel(challenge: Challenge) {
  if (challenge.prize_structure === 'winner_take_all') {
    return 'winner take all';
  }
  if (challenge.prize_structure === 'top_places') {
    return 'top places';
  }
  return 'equal split among completers';
}

export function SettleConfirmModal({
  visible,
  challenge,
  loading,
  error,
  mode = 'settle',
  completerCount,
  onClose,
  onConfirm,
}: SettleConfirmModalProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!visible) {
      setChecked(false);
    }
  }, [visible]);

  function close() {
    if (loading) {
      return;
    }
    onClose();
  }

  const unlimited = isUnlimitedChallenge(challenge);
  const judging = mode === 'judge';
  const pool = formatWallet(challenge.prize_pool, challenge.currency);
  const finishers = Math.max(Number(completerCount) || 0, 0);

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <Pressable
        className="px-5 pb-10 pt-6"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
        }}
        onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">
            {judging ? 'Lock results?' : 'Distribute prizes?'}
          </AppText>
          <AppText className="mt-2 text-muted">
            {judging
              ? 'The window is over. This locks new check-ins and joins. Payout unlocks 1 hour after the challenge ended.'
              : `${pool} will be paid out now (${structureLabel(challenge)}${
                  finishers > 0 ? ` · ${finishers} completer${finishers === 1 ? '' : 's'}` : ''
                }). This can only happen once.`}
          </AppText>
          {unlimited && !judging ? (
            <AppText className="mt-3 text-sm leading-5 text-muted">
              Last remaining eligible person takes the prize.
            </AppText>
          ) : null}

          <Pressable
            onPress={() => setChecked((current) => !current)}
            className="mt-5 rounded-blob border px-4 py-3"
            style={{
              backgroundColor: THEME.surface,
              borderColor: checked ? THEME.primary : THEME.border,
              borderWidth: 1.5,
              borderRadius: THEME.radius,
            }}>
            <View className="flex-row items-start gap-3">
              <View
                className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
                style={{
                  backgroundColor: checked ? THEME.primary : THEME.background,
                  borderColor: checked ? THEME.primary : THEME.border,
                }}>
                {checked ? (
                  <AppText
                    className="text-[11px] font-bold"
                    style={{ color: THEME.primaryForeground }}>
                    ✓
                  </AppText>
                ) : null}
              </View>
              <AppText className="flex-1 font-semibold leading-5 text-charcoal">
                {judging
                  ? 'I understand results lock now, and payout waits one hour after the end.'
                  : 'I understand winners are paid from the prize and this cannot be undone.'}
              </AppText>
            </View>
          </Pressable>

          <View className="mt-6 gap-3">
            {error ? (
              <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
            ) : null}
            <Button
              title={judging ? 'Lock results' : 'Distribute prizes'}
              size="lg"
              loading={loading}
              disabled={!checked}
              onPress={onConfirm}
            />
            <Button title="Not now" variant="ghost" onPress={close} disabled={loading} />
          </View>
      </Pressable>
    </ChromeOverlay>
  );
}
