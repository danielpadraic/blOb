import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { canShortenStartRoll, startMovedBody, startRollKeepDays } from '@/lib/challengeStart';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

type StartRollSheetProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onKeep: () => void;
  onShorten: () => void;
};

export function StartRollSheet({
  visible,
  challenge,
  loading,
  error,
  onClose,
  onKeep,
  onShorten,
}: StartRollSheetProps) {
  const keepDays = startRollKeepDays(challenge);
  const canShorten = canShortenStartRoll(challenge);

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
        <AppText className="mt-2 text-muted">{startMovedBody(challenge)}</AppText>
        <View className="mt-6 gap-3">
          {error ? (
            <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
          ) : null}
          <Button
            title={copy('challenge.keepDays', 'neutral', { n: keepDays })}
            size="lg"
            loading={loading}
            onPress={onKeep}
          />
          {canShorten ? (
            <Button
              title={copy('challenge.shortenDay')}
              size="lg"
              variant="outline"
              disabled={loading}
              onPress={onShorten}
            />
          ) : null}
          <Button title={copy('challenge.startMovedLater')} variant="ghost" onPress={close} disabled={loading} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}
