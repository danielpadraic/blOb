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
import { formatProfileWeight, hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { experienceLabel, goalLabel, hasCompletedFitnessHistory } from '@/lib/fitnessProfile';
import { BODY_METRICS_HREF, FITNESS_HISTORY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { formatHeight } from '@/utils/units';

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

        {hasCompletedBodyMetrics(profile) ? (
          <Button
            title="Update body metrics"
            variant="outline"
            onPress={() => router.push(BODY_METRICS_HREF)}
          />
        ) : (
          <Card className="gap-2">
            <AppText className="text-[16px] font-extrabold text-charcoal">Finish body metrics</AppText>
            <AppText className="text-[13px] leading-5 text-muted">
              A private snapshot that unlocks Official Fitness Challenges. Not a score — just better matching.
            </AppText>
            <Button title="Add body metrics" onPress={() => router.push(BODY_METRICS_HREF)} />
          </Card>
        )}

        {hasCompletedFitnessHistory(profile) ? (
          <Button
            title="Update fitness history"
            variant="outline"
            onPress={() => router.push(FITNESS_HISTORY_HREF)}
          />
        ) : (
          <Card className="gap-2">
            <AppText className="text-[16px] font-extrabold text-charcoal">Add fitness history</AppText>
            <AppText className="text-[13px] leading-5 text-muted">
              Optional, but it helps us place you in the right challenges. Skip anything that doesn’t fit.
            </AppText>
            <Button title="Add fitness history" onPress={() => router.push(FITNESS_HISTORY_HREF)} />
          </Card>
        )}

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
              value={formatProfileWeight(profile)}
              borderLeft
            />
          </View>
          {hasCompletedFitnessHistory(profile) ? (
            <View
              className="flex-row"
              style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
              <StatCell
                label="Experience"
                value={experienceLabel(profile.fitness_profile?.experience_level)}
              />
              <StatCell
                label="Aim"
                value={goalLabel(profile.fitness_profile?.primary_goal)}
                borderLeft
              />
            </View>
          ) : null}
          {hasCompletedBodyMetrics(profile) && profile.body_fat_pct != null ? (
            <View
              className="flex-row"
              style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
              <StatCell
                label="Body fat"
                value={`${Math.round(Number(profile.body_fat_pct))}%`}
              />
              <View className="flex-1" />
            </View>
          ) : null}
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
