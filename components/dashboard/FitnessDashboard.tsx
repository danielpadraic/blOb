import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { useFriendCount } from '@/hooks/useSocial';
import {
  sourceChipLabel,
  useFitnessDashboard,
  type DashboardChip,
  type DashboardSource,
} from '@/hooks/useFitnessDashboard';
import {
  dismissHomePrompt,
  homePromptVisible,
  hydrateHomePrompt,
  markHomeVisited,
} from '@/lib/dashboard/homePrompt';
import type { DashboardRange } from '@/lib/dashboard/range';
import { formatCash } from '@/lib/currency';
import { useWalletOptional } from '@/hooks/useWallet';
import { THEME, themeShadow } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

const RANGES: DashboardRange[] = ['today', 'week', 'month', 'year'];
const RANGE_LABEL: Record<DashboardRange, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const PHONE_CHIPS: DashboardChip[] = ['fitness', 'challenges', 'sleep', 'nutrition', 'all'];
const CHIP_LABEL: Record<DashboardChip, string> = {
  fitness: 'Fitness',
  challenges: 'Challenges',
  sleep: 'Sleep',
  nutrition: 'Nutrition',
  all: 'All',
};

export function FitnessDashboard({ profile }: { profile: Profile }) {
  const router = useRouter();
  const wallet = useWalletOptional();
  const friends = useFriendCount(profile.id);
  const [range, setRange] = useState<DashboardRange>('week');
  const [chip, setChip] = useState<DashboardChip>('fitness');
  const [source, setSource] = useState<DashboardSource | null>(null);
  const [promptTick, setPromptTick] = useState(0);
  const dash = useFitnessDashboard(range);
  const prompt = useQuery({
    queryKey: ['home-prompt', profile.id, promptTick],
    queryFn: async () => {
      await hydrateHomePrompt(profile.id);
      const posts = await supabase
        .from('posts')
        .select('id, created_at, author_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(12);
      const rows = (posts.data ?? []) as Array<{ id: string; created_at: string; author_id: string }>;
      const next = rows.find((row) => row.author_id !== profile.id && homePromptVisible(profile.id, row.created_at));
      if (!next) {
        return null;
      }
      const person = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', next.author_id)
        .maybeSingle();
      const name =
        String(person.data?.display_name ?? '').trim() ||
        (person.data?.username ? `@${person.data.username}` : 'Someone');
      return { id: next.id, createdAt: next.created_at, name };
    },
  });

  useEffect(() => {
    void hydrateHomePrompt(profile.id).then(() => setPromptTick((n) => n + 1));
  }, [profile.id]);

  const showFitness = chip === 'fitness' || chip === 'all';
  const showChallenges = chip === 'challenges' || chip === 'all' || chip === 'fitness';
  const model = dash.model;
  const activities = source ? model.activities.filter((row) => row.source === source) : model.activities;
  const friendCount = friends.data ?? 0;
  const liveCount = model.challenges.length;
  const meta = [
    friendCount > 0 ? `${friendCount} friends` : '',
    liveCount > 0 ? `${liveCount} live` : '',
  ].filter(Boolean);

  function openHome() {
    markHomeVisited(profile.id);
    router.navigate('/feed');
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 128, gap: 12 }}>
      <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>You</AppText>
      <AppText style={{ color: THEME.textMuted, marginTop: -8 }}>
        Profile stays first. The dashboard is the effort under it.
      </AppText>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {RANGES.map((item) => {
          const on = item === range;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setRange(item)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: on ? THEME.accent : THEME.surface,
                borderWidth: 1,
                borderColor: on ? THEME.accent : THEME.border,
              }}>
              <AppText style={{ fontSize: 13, fontWeight: '700', color: on ? THEME.primaryForeground : THEME.textPrimary }}>
                {RANGE_LABEL[item]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={() => wallet?.openWallet()} style={{ alignSelf: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CurrencyMark currency="coins" size={18} />
          <AppText style={{ fontWeight: '800', color: THEME.textPrimary }}>
            {Math.round(Number(profile.coins ?? profile.credits ?? 0)).toLocaleString('en-US')}
          </AppText>
          <AppText style={{ fontWeight: '800', color: THEME.accent }}>{formatCash(Number(profile.bucks ?? 0))}</AppText>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar uri={profile.avatar_url} name={profile.display_name ?? profile.username} size={64} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={{ fontSize: 22, fontWeight: '800', color: THEME.textPrimary }} numberOfLines={1}>
            {profile.display_name ?? profile.username}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')}>
            <AppText style={{ color: THEME.textMuted }}>@{profile.username} · Edit profile</AppText>
          </Pressable>
          {meta.length > 0 ? (
            <AppText style={{ color: THEME.textMuted, marginTop: 2 }}>{meta.join(' · ')}</AppText>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TextButton title="Edit profile" onPress={() => router.push('/profile/edit')} filled />
        <TextButton
          title="View public"
          onPress={() =>
            router.push({ pathname: '/profile/u/[username]', params: { username: profile.username } })
          }
        />
        <TextButton title="Settings" onPress={() => router.push('/profile/account')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PHONE_CHIPS.map((item) => {
          const on = item === chip;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setChip(item)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: on ? THEME.accent : THEME.surface,
                borderWidth: 1,
                borderColor: on ? THEME.accent : THEME.border,
              }}>
              <AppText style={{ fontWeight: '700', color: on ? THEME.primaryForeground : THEME.textPrimary }}>
                {CHIP_LABEL[item]}
                {item === 'nutrition' ? ' · soon' : ''}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {prompt.data ? (
        <View
          style={{
            backgroundColor: THEME.surface,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            padding: 12,
            gap: 8,
            ...themeShadow('card'),
          }}>
          <Pressable accessibilityRole="button" onPress={openHome}>
            <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{prompt.data.name} posted</AppText>
            <AppText style={{ color: THEME.accent, marginTop: 2 }}>Open Home</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              dismissHomePrompt(profile.id, prompt.data?.createdAt ?? '');
              setPromptTick((n) => n + 1);
            }}>
            <AppText style={{ color: THEME.textMuted }}>Dismiss</AppText>
          </Pressable>
        </View>
      ) : null}

      {chip === 'sleep' || chip === 'nutrition' ? (
        <AppText style={{ color: THEME.textMuted }}>Later</AppText>
      ) : null}

      {showFitness && model.liftVolumeLabel ? (
        <Card title="Lift volume">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.liftVolumeLabel}</AppText>
          {model.liftSessionCount > 0 ? (
            <AppText style={{ color: THEME.textMuted }}>
              {model.liftSessionCount} {model.liftSessionCount === 1 ? 'session' : 'sessions'}
            </AppText>
          ) : null}
          <Source label="Lift" />
        </Card>
      ) : null}

      {showFitness && model.cardioLabel ? (
        <Card title="Cardio">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.cardioLabel}</AppText>
          <Source label="Lift" />
        </Card>
      ) : null}

      {showFitness && model.checkinCount > 0 ? (
        <Card title="Check-ins">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.checkinCount}</AppText>
          <Source label="Check-in" />
        </Card>
      ) : null}

      {showFitness && model.days.length > 0 ? (
        <Card title="Active minutes">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 88 }}>
            {model.days.map((day) => (
              <View key={day.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                <View
                  style={{
                    width: '70%',
                    height: Math.max(8, Math.round((day.minutes / Math.max(...model.days.map((item) => item.minutes))) * 72)),
                    backgroundColor: THEME.accent,
                    borderRadius: 6,
                  }}
                />
                <AppText style={{ color: THEME.textMuted, marginTop: 4, fontSize: 11 }}>{day.label}</AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {showChallenges && model.challenges.length > 0 ? (
        <Card title="Live challenges">
          {model.challenges.map((row) => (
            <Pressable key={row.id} accessibilityRole="button" onPress={() => router.push(`/challenges/${row.id}`)}>
              <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{row.title}</AppText>
              <AppText style={{ color: THEME.textMuted, marginBottom: 6 }}>{row.line}</AppText>
              <View style={{ height: 8, borderRadius: 99, backgroundColor: THEME.accentSoft, marginBottom: 10 }}>
                <View
                  style={{
                    height: 8,
                    borderRadius: 99,
                    width: `${Math.round(row.progress * 100)}%`,
                    backgroundColor: THEME.accent,
                  }}
                />
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {showFitness ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([null, 'healthkit', 'health_connect', 'lift', 'checkin'] as const).map((item) => {
            const on = source === item;
            const label = item ? sourceChipLabel(item) : 'All sources';
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                onPress={() => setSource(item)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: on ? THEME.accentSoft : THEME.surface,
                  borderWidth: 1,
                  borderColor: THEME.border,
                }}>
                <AppText style={{ fontSize: 12, fontWeight: '700', color: THEME.accent }}>{label}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showFitness && activities.length > 0 ? (
        <Card title="Recent">
          {activities.map((row) => (
            <Pressable key={row.id} accessibilityRole="button" onPress={() => router.push(row.href as never)} style={{ marginBottom: 10 }}>
              <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{row.title}</AppText>
              <AppText style={{ color: THEME.textMuted }}>
                {[row.when, row.proof, sourceChipLabel(row.source)].filter(Boolean).join(' · ')}
              </AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {model.trophies.length > 0 ? (
        <Card title="Trophies">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {model.trophies.map((name) => (
              <View
                key={name}
                style={{
                  backgroundColor: THEME.calloutWash,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}>
                <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{name}</AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {model.earnedLabel ? (
        <Card title="Earned">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.accent }}>{model.earnedLabel}</AppText>
          <Source label="Wallet · in-app only" />
        </Card>
      ) : null}

      {dash.loading ? <AppText style={{ color: THEME.textMuted }}>Loading your effort…</AppText> : null}
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        padding: 14,
        gap: 6,
        ...themeShadow('card'),
      }}>
      <AppText style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: THEME.textMuted }}>{title}</AppText>
      {children}
    </View>
  );
}

function Source({ label }: { label: string }) {
  return (
    <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent, marginTop: 4 }}>{label}</AppText>
  );
}

function TextButton({ title, onPress, filled }: { title: string; onPress: () => void; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: filled ? THEME.primary : THEME.surface,
        borderWidth: 1,
        borderColor: filled ? THEME.primary : THEME.border,
      }}>
      <AppText style={{ fontWeight: '700', color: filled ? THEME.primaryForeground : THEME.textPrimary }}>{title}</AppText>
    </Pressable>
  );
}
