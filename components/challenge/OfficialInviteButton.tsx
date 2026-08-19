import { Alert, Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { shareOfficialChallenge } from '@/lib/officialShare';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

type OfficialInviteButtonProps = {
  challengeId: string;
  challengeTitle?: string;
  onOpenPicker?: () => void;
  tone?: 'card' | 'hero';
};

export function OfficialInviteButton({
  challengeId,
  onOpenPicker,
  tone = 'card',
}: OfficialInviteButtonProps) {
  async function share() {
    try {
      const result = await shareOfficialChallenge(challengeId);
      if (result === 'copied') {
        Alert.alert('Link copied', 'A small promise. Then you move.');
      }
    } catch (error) {
      Alert.alert('Couldn’t share', getErrorMessage(error));
    }
  }

  function onPress(event?: { stopPropagation?: () => void }) {
    event?.stopPropagation?.();
    if (onOpenPicker) {
      onOpenPicker();
      return;
    }
    void share();
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
