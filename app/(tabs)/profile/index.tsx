import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { WalletBalances } from '@/components/currency/WalletBalances';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { AppHeader } from '@/components/wallet/AppHeader';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { THEME } from '@/lib/theme';
import { formatHeight, formatWeight } from '@/utils/units';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { profile, isLoading, error, refetch } = useMyProfile();
  const wallet = useWalletOptional();
  const router = useRouter();

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <AppHeader title="You" />
        <MascotState kind="loading" title="Finding your blob" />
      </Screen>
    );
  }

  if (error || !profile) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <AppHeader title="You" />
        <MascotState
          kind="error"
          title="Couldn’t load your profile"
          body={error instanceof Error ? error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  const activities = profile.primary_activities.length
    ? profile.primary_activities.join(', ')
    : 'Not set';
  const frequency =
    profile.typical_weekly_workout_frequency != null
      ? `${profile.typical_weekly_workout_frequency}x / week`
      : 'Not set';

  return (
    <Screen scroll edges={TAB_ROOT_EDGES}>
      <AppHeader title="You" />
      <ProfileHeader profile={profile} />

      <View className="mt-3">
        <Button
          title="View public profile"
          variant="outline"
          size="sm"
          onPress={() =>
            router.push({
              pathname: '/profile/u/[username]',
              params: { username: profile.username },
            })
          }
        />
      </View>

      <View className="mt-4 gap-3">
        <Pressable accessibilityRole="button" onPress={wallet?.openWallet}>
          <WalletBalances profile={profile} />
        </Pressable>
        <Button title="Send Coins or Bucks" variant="outline" onPress={() => router.push('/profile/send')} />

        <Card padded={false}>
          <View className="px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: THEME.border }}>
            <AppText className="text-[13px] font-semibold text-charcoal">
              Training snapshot
            </AppText>
          </View>
          <View className="flex-row">
            <StatCell label="Activities" value={activities} />
            <StatCell
              label="Frequency"
              value={frequency}
              borderLeft
            />
          </View>
          <View
            className="flex-row"
            style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
            <StatCell
              label="Height"
              value={formatHeight(profile.height_cm, profile.weight_unit)}
            />
            <StatCell
              label="Weight"
              value={formatWeight(profile.current_weight, profile.weight_unit)}
              borderLeft
            />
          </View>
          <View className="px-4 py-2.5" style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
            <AppText className="text-[11px] leading-4 text-muted">
              {profile.show_fitness_stats_publicly
                ? 'Visible on your public profile.'
                : 'Only you can see these numbers.'}
            </AppText>
          </View>
        </Card>

        <View className="mt-2">
          <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>
    </Screen>
  );
}

function StatCell({
  label,
  value,
  borderLeft,
}: {
  label: string;
  value: string;
  borderLeft?: boolean;
}) {
  return (
    <View
      className="flex-1 px-4 py-3"
      style={borderLeft ? { borderLeftWidth: 1, borderLeftColor: THEME.border } : undefined}>
      <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
      <AppText className="mt-1 text-sm font-semibold capitalize text-charcoal" numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}
