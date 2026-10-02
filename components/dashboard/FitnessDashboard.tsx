import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
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
import { readDashboardRange, writeDashboardRange } from '@/lib/dashboard/rangeChoice';
import type { DashboardRange } from '@/lib/dashboard/range';
import { isWideDashboardWindow } from '@/lib/dashboard/wide';
import { TAB_BAR_PEEK, tabBarLift, THEME, themeShadow } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

const RANGES: DashboardRange[] = ['today', 'week', 'month', 'year', 'custom'];
const RANGE_LABEL: Record<DashboardRange, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  custom: 'Custom',
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = isWideDashboardWindow(width, Platform.OS);
  const friends = useFriendCount(profile.id);
  const [range, setRange] = useState<DashboardRange>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chip, setChip] = useState<DashboardChip>('fitness');
  const [source, setSource] = useState<DashboardSource | null>(null);
  const [promptTick, setPromptTick] = useState(0);
  const custom = range === 'custom' && customStart && customEnd ? { start: customStart, end: customEnd } : null;
  const dash = useFitnessDashboard(range, custom);
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
    void readDashboardRange().then((stored) => {
      setRange(stored.range);
      setCustomStart(stored.custom?.start ?? '');
      setCustomEnd(stored.custom?.end ?? '');
    });
  }, [profile.id]);

  function chooseRange(next: DashboardRange) {
    setRange(next);
    writeDashboardRange({
      range: next,
      custom: customStart && customEnd ? { start: customStart, end: customEnd } : null,
    });
  }

  function chooseCustom(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    writeDashboardRange({ range: 'custom', custom: start && end ? { start, end } : null });
  }

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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: wide ? 32 : tabBarLift(insets.bottom) + TAB_BAR_PEEK, gap: 12 }}>
      <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>You</AppText>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {RANGES.map((item) => {
          const on = item === range;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => chooseRange(item)}
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

      {range === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={customStart}
            onChangeText={(value) => chooseCustom(value, customEnd)}
            placeholder="Start YYYY-MM-DD"
            placeholderTextColor={THEME.textMuted}
            autoCapitalize="none"
            style={dateField}
          />
          <TextInput
            value={customEnd}
            onChangeText={(value) => chooseCustom(customStart, value)}
            placeholder="End YYYY-MM-DD"
            placeholderTextColor={THEME.textMuted}
            autoCapitalize="none"
            style={dateField}
          />
        </View>
      ) : null}

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 }}>
          <AppText style={{ flex: 1, fontWeight: '700', color: THEME.textPrimary }} numberOfLines={1}>
            {prompt.data.name}
          </AppText>
          <Pressable accessibilityRole="button" onPress={openHome}>
            <AppText style={{ fontWeight: '700', color: THEME.accent }}>Open Home</AppText>
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
        <Card title="Lift">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.liftVolumeLabel}</AppText>
          {model.liftSessionCount > 0 ? (
            <AppText style={{ color: THEME.textMuted }}>
              {model.liftSessionCount} {model.liftSessionCount === 1 ? 'session' : 'sessions'}
            </AppText>
          ) : null}
          <DayChart days={model.liftBars} />
          <Source label="Lift" />
        </Card>
      ) : null}

      {showFitness && model.minuteBars.length > 0 ? (
        <Card title="Active minutes">
          <DayChart days={model.minuteBars} />
        </Card>
      ) : null}

      {showFitness && model.cardioLabel ? (
        <Card title="Duration">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.cardioLabel}</AppText>
          <DayChart days={model.cardioBars} />
          <Source label="Lift" />
        </Card>
      ) : null}

      {showFitness && model.calorieLabel ? (
        <Card title="Calories">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.calorieLabel}</AppText>
          <Source label="Check-in" />
        </Card>
      ) : null}

      {showFitness && model.stepLabel ? (
        <Card title="Steps">
          <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>{model.stepLabel}</AppText>
          <Source label="Check-in" />
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
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <AppText style={columnHead}>Session</AppText>
            <AppText style={columnHead}>When</AppText>
            <AppText style={columnHead}>Proof</AppText>
            <AppText style={columnHead}>Source</AppText>
          </View>
          {activities.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              onPress={() => router.push(row.href as never)}
              style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <AppText style={columnCell} numberOfLines={2}>{row.title}</AppText>
              <AppText style={columnCell}>{row.when}</AppText>
              <AppText style={columnCell}>{row.proof}</AppText>
              <AppText style={columnCell}>{sourceChipLabel(row.source)}</AppText>
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

const dateField = {
  flex: 1,
  borderWidth: 1,
  borderColor: THEME.border,
  borderRadius: 12,
  paddingHorizontal: 10,
  paddingVertical: 8,
  color: THEME.textPrimary,
  backgroundColor: THEME.surface,
};

const columnHead = { flex: 1, fontSize: 11, fontWeight: '800' as const, color: THEME.textMuted };
const columnCell = { flex: 1, fontSize: 13, color: THEME.textPrimary };

function DayChart({ days }: { days: Array<{ key: string; label: string; value: number }> }) {
  const max = Math.max(...days.map((day) => day.value), 1);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96, paddingTop: 8 }}>
        {days.map((day) => (
          <View key={day.key} style={{ width: 28, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View
              style={{
                width: 16,
                height: day.value > 0 ? Math.max(6, Math.round((day.value / max) * 72)) : 2,
                backgroundColor: day.value > 0 ? THEME.accent : THEME.border,
                borderRadius: 4,
              }}
            />
            <AppText style={{ color: THEME.textMuted, marginTop: 4, fontSize: 10 }}>{day.label}</AppText>
          </View>
        ))}
      </View>
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
