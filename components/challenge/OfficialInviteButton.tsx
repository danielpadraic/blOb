import { Alert, Pressable } from 'react-native';

import { useInviteHost } from '@/components/challenge/InviteHost';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type OfficialInviteButtonProps = {
  challengeId: string;
  challengeTitle?: string;
  onOpenPicker?: () => void;
  tone?: 'card' | 'hero';
  shareLink?: boolean;
};

export function OfficialInviteButton({
  challengeId,
  challengeTitle,
  onOpenPicker,
  tone = 'card',
  shareLink = true,
}: OfficialInviteButtonProps) {
  const host = useInviteHost();

  function onPress(event?: { stopPropagation?: () => void }) {
    event?.stopPropagation?.();
    if (onOpenPicker) {
      onOpenPicker();
      return;
    }
    if (!host) {
      Alert.alert('Couldn’t invite', 'Open this challenge and tap Invite again.');
      return;
    }
    host.open({
      challengeId,
      challengeTitle: challengeTitle?.trim() || 'this challenge',
      shareLink,
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Invite a friend"
      onPress={(event) => onPress(event)}
      style={{
        minHeight: 44,
        marginTop: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tone === 'hero' ? 'rgba(255,255,255,0.35)' : THEME.border,
        backgroundColor: tone === 'hero' ? 'rgba(255,255,255,0.12)' : THEME.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
      }}>
      <AppText
        className="text-[13px] font-semibold"
        style={{ color: tone === 'hero' ? '#fff' : THEME.textPrimary }}>
        Invite
      </AppText>
    </Pressable>
  );
}
