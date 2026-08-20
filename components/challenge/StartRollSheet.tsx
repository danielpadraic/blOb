import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DateTimeField } from '@/components/challenge/create/DateTimeField';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import {
  canShortenStartRoll,
  nextStartAt,
  startMovedBody,
  startRollKeepDays,
} from '@/lib/challengeStart';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

export type StartRollMode = 'keep' | 'shorten';

type StartRollSheetProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (startsAt: string, mode: StartRollMode) => void;
};

export function StartRollSheet({
  visible,
  challenge,
  loading,
  error,
  onClose,
  onApply,
}: StartRollSheetProps) {
  const keepDays = startRollKeepDays(challenge);
  const [startsAt, setStartsAt] = useState(() => nextStartAt(challenge.starts_at));
  const canShorten = canShortenStartRoll({
    starts_at: startsAt,
    ends_at: challenge.ends_at,
    is_unlimited: challenge.is_unlimited,
  });

  useEffect(() => {
    setStartsAt(nextStartAt(challenge.starts_at));
  }, [challenge.id, challenge.starts_at]);

  function close() {
    if (loading) {
      return;
    }
    onClose();
  }

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
        <AppText className="text-2xl font-bold text-charcoal">{copy('challenge.startMovedTitle')}</AppText>
        <AppText className="mt-2 text-muted">{startMovedBody({ ...challenge, starts_at: startsAt })}</AppText>
        <View className="mt-5">
          <DateTimeField
            label={copy('challenge.pickStart')}
            value={startsAt}
            minimumDate={new Date()}
            onChange={setStartsAt}
          />
        </View>
        <View className="mt-6 gap-3">
          {error ? (
            <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
          ) : null}
          <Button
            title={copy('challenge.keepDays', 'neutral', { n: keepDays })}
            size="lg"
            loading={loading}
            onPress={() => onApply(startsAt, 'keep')}
          />
          {canShorten ? (
            <Button
              title={copy('challenge.shortenDay')}
              size="lg"
              variant="outline"
              disabled={loading}
              onPress={() => onApply(startsAt, 'shorten')}
            />
          ) : null}
          <Button title={copy('challenge.startMovedLater')} variant="ghost" onPress={close} disabled={loading} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}
