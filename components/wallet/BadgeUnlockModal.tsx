import { Modal, Pressable, View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Button } from '@/components/ui/Button';
import { Glyph } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useWallet } from '@/hooks/useWallet';
import { badgeGlyph, badgeTone } from '@/lib/badges';
import { BADGE_TONE } from '@/lib/profileBadges';
import { THEME } from '@/lib/theme';
import { formatCoins } from '@/utils/format';

export function BadgeUnlockModal() {
  const { unlocks, dismissUnlock } = useWallet();
  const current = unlocks[0];
  if (!current) {
    return null;
  }

  const name = current.definition?.name ?? current.title ?? 'New badge';
  const body = current.definition?.description ?? 'That’s yours now.';
  const tone = BADGE_TONE[badgeTone(current.definition?.tone)];
  const reward = Number(current.coin_reward ?? current.definition?.coin_reward ?? 0);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissUnlock}>
      <Pressable className="flex-1 items-center justify-center bg-charcoal/70 px-6" onPress={dismissUnlock}>
        <Pressable
          className="w-full items-center px-5 py-6"
          style={{
            backgroundColor: THEME.background,
            borderRadius: THEME.radiusLg,
          }}
          onPress={(event) => event.stopPropagation()}>
          <BlobMascot size={120} motion="float" />
          <AppText className="mt-3 text-[13px] font-semibold uppercase tracking-widest text-muted">
            You earned this
          </AppText>
          <View
            className="mt-3 h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: tone.bg, borderColor: tone.ring, borderWidth: 1 }}>
            <Glyph name={badgeGlyph(current.definition?.icon)} color={tone.fg} size={26} />
          </View>
          <AppText className="mt-3 text-center text-[22px] font-bold text-charcoal">{name}</AppText>
          <AppText className="mt-1 text-center text-[14px] leading-5 text-muted">{body}</AppText>
          {reward > 0 ? (
            <AppText className="mt-3 text-center text-[15px] font-bold" style={{ color: '#8A6A12' }}>
              +{formatCoins(reward)}
            </AppText>
          ) : null}
          {unlocks.length > 1 ? (
            <AppText className="mt-2 text-[12px] text-muted">
              {unlocks.length - 1} more waiting
            </AppText>
          ) : null}
          <View className="mt-5 w-full">
            <Button title={unlocks.length > 1 ? 'Next' : 'Nice'} onPress={dismissUnlock} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
