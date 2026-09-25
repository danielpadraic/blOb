import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

type LeaveChallengeSheetProps = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  /** Official Coin leaves two rooms at once, so it warns in its own words. */
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function LeaveChallengeSheet({
  visible,
  loading,
  error,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
}: LeaveChallengeSheetProps) {
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
        <AppText className="text-2xl font-bold text-charcoal">
          {title ?? copy('challenge.leave')}
        </AppText>
        <AppText className="mt-2 text-muted">{body ?? copy('challenge.leaveConfirm')}</AppText>
        <View className="mt-6 gap-3">
          {error ? (
            <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
          ) : null}
          <Button
            title={confirmLabel ?? copy('challenge.leave')}
            size="lg"
            variant="danger"
            loading={loading}
            onPress={onConfirm}
          />
          <Button
            title={cancelLabel ?? copy('challenge.leaveKeep')}
            variant="ghost"
            onPress={close}
            disabled={loading}
          />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}
