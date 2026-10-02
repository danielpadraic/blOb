import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { ProgressRing } from '@/components/ui/ProgressRing';
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
import type { DayMark } from '@/lib/dashboard/calendar';
import type { DashboardRange } from '@/lib/dashboard/range';
import { isWideDashboardWindow } from '@/lib/dashboard/wide';
import { copy } from '@/lib/copy';
import { healthHowToLine } from '@/lib/health/howTo';
import { getHealthProvider } from '@/services/health';
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
  const activities = model.activities.filter((row) => !source || row.sources.includes(source));
  const sleepCard = model.bodyCards.find((card) => card.key === 'sleep') ?? null;
  const ringCards = model.bodyCards.filter((card) => card.key === 'move' || card.key === 'exercise' || card.key === 'stand');
  const bodyCards = model.bodyCards.filter(
    (card) => card.key !== 'sleep' && card.key !== 'move' && card.key !== 'exercise' && card.key !== 'stand',
  );
  const queryClient = useQueryClient();
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

      {chip === 'nutrition' ? <AppText style={{ color: THEME.textMuted }}>Later</AppText> : null}
      {chip === 'sleep' && !sleepCard ? <AppText style={{ color: THEME.textMuted }}>Later</AppText> : null}

      {showFitness && model.checkinCells.length > 0 ? (
        <Card
          title={model.checkinLabel ? `Check-ins · ${model.checkinLabel}` : 'Check-ins'}
          chip="Check-in">
          <CheckinCalendar cells={model.checkinCells} marks={model.checkinMarks} header={model.checkinHeader} />
        </Card>
      ) : null}

      {showFitness && model.liftVolumeLabel ? (
        <Card title={`Pounds · ${model.liftVolumeLabel}`} chip="Lift">
          <DayChart days={model.liftBars} color={THEME.accent} />
        </Card>
      ) : null}

      {showFitness && model.liftTimeLabel ? (
        <Card title={`Lift time · ${model.liftTimeLabel}`} chip="Lift">
          <DayChart days={model.liftTimeBars} color={THEME.circle} />
        </Card>
      ) : null}

      {showFitness && model.cardioTimeLabel ? (
        <Card title={`Cardio time · ${model.cardioTimeLabel}`} chip="Lift">
          <DayLines days={model.cardioTimeBars} color={THEME.circle} />
        </Card>
      ) : null}

      {showFitness && model.mileLabel ? (
        <Card title={`Miles · ${model.mileLabel}`} chip="Check-in">
          <DayChart days={model.mileBars} color={THEME.accentBright} />
        </Card>
      ) : null}

      {showFitness && model.stepLabel ? (
        <Card title={`Steps · ${model.stepLabel}`} chip="Check-in">
          <DayChart days={model.stepBars} color={THEME.accentBright} />
        </Card>
      ) : null}

      {showFitness && ringCards.length > 0 ? (
        <Card title="Rings" chip={ringCards.find((card) => card.source) ? sourceChipLabel(ringCards.find((card) => card.source)?.source ?? 'checkin') : undefined}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            {ringCards.map((card) => (
              <View key={card.key} style={{ alignItems: 'center', gap: 4 }}>
                <ProgressRing
                  progress={1}
                  size={72}
                  strokeWidth={7}
                  color={card.key === 'stand' ? THEME.gold : card.key === 'exercise' ? THEME.circle : THEME.accent}
                  label={card.valueLabel}
                  labelClassName="text-[11px] font-bold text-center"
                  caption={card.title}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {showFitness && model.syncedLabel ? (
        <AppText style={{ color: THEME.textMuted }}>{model.syncedLabel}</AppText>
      ) : null}

      {showFitness
        ? bodyCards.map((card) => (
            <Card
              key={card.key}
              title={`${card.title} · ${card.valueLabel}`}
              chip={card.source ? sourceChipLabel(card.source) : undefined}>
              <DayChart days={card.bars} color={THEME.accentBright} />
            </Card>
          ))
        : null}

      {(chip === 'sleep' || chip === 'all') && sleepCard ? (
        <Card
          title={`Sleep · ${sleepCard.valueLabel}`}
          chip={sleepCard.source ? sourceChipLabel(sleepCard.source) : undefined}>
          <DayLines days={sleepCard.bars} color={THEME.gold} />
        </Card>
      ) : null}

      {showFitness && !dash.loading && bodyCards.length === 0 && !sleepCard && Platform.OS !== 'web' ? (
        <AllowHealth
          onAllowed={() => {
            void queryClient.invalidateQueries({ queryKey: ['fitness-dashboard'] });
          }}
        />
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
              onPress={() => {
                if (row.href) {
                  router.push(row.href as never);
                }
              }}
              style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <AppText style={columnCell} numberOfLines={2}>{row.title}</AppText>
              <AppText style={columnCell}>{row.when}</AppText>
              <AppText style={columnCell}>{row.proof}</AppText>
              <AppText style={columnCell}>{row.sources.map((item) => sourceChipLabel(item)).join(' · ')}</AppText>
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

      {model.earnedLabel ? <Card title={`Earned · ${model.earnedLabel}`} chip="Wallet" /> : null}

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

function DayChart({
  days,
  color,
}: {
  days: Array<{ key: string; label: string; value: number }>;
  color: string;
}) {
  const max = Math.max(...days.map((day) => day.value), 1);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 }}>
        {days.map((day) => (
          <View key={day.key} style={{ width: 22, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View
              style={{
                width: 12,
                height: day.value > 0 ? Math.max(4, Math.round((day.value / max) * 40)) : 2,
                backgroundColor: day.value > 0 ? color : THEME.border,
                borderRadius: 4,
              }}
            />
            <AppText style={{ color: THEME.textMuted, marginTop: 2, fontSize: 10 }}>{day.label}</AppText>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function DayLines({
  days,
  color,
}: {
  days: Array<{ key: string; label: string; value: number }>;
  color: string;
}) {
  const max = Math.max(...days.map((day) => day.value), 1);
  return (
    <View style={{ gap: 3 }}>
      {days.map((day) => (
        <View key={day.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText style={{ width: 14, fontSize: 10, color: THEME.textMuted }}>{day.label}</AppText>
          <View style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: THEME.border }}>
            <View
              style={{
                width: `${Math.max(day.value > 0 ? 4 : 0, Math.round((day.value / max) * 100))}%`,
                height: 6,
                borderRadius: 99,
                backgroundColor: day.value > 0 ? color : 'transparent',
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const WEEKDAY_HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function CheckinCalendar({
  cells,
  marks,
  header,
}: {
  cells: Array<{ key: string | null; numeral: string; weekday: string }>;
  marks: Record<string, DayMark>;
  header: boolean;
}) {
  return (
    <View>
      {header ? (
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_HEAD.map((letter, index) => (
            <AppText key={`${letter}-${index}`} style={calendarHead}>
              {letter}
            </AppText>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((cell, index) => {
          const mark = cell.key ? (marks[cell.key] ?? 'empty') : 'empty';
          const label = !cell.key ? '' : mark === 'done' ? 'Complete' : mark === 'miss' ? 'Missed' : mark === 'due' ? 'Due' : 'Nothing due';
          return (
            <View key={cell.key ?? `pad-${index}`} accessibilityLabel={label} style={calendarCell}>
              {cell.key ? (
                <View style={calendarMark(mark)}>
                  {!header && cell.weekday ? (
                    <AppText style={{ fontSize: 9, color: mark === 'done' ? THEME.primaryForeground : THEME.textMuted }}>
                      {cell.weekday}
                    </AppText>
                  ) : null}
                  <AppText
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: mark === 'done' ? THEME.primaryForeground : mark === 'miss' ? THEME.circle : THEME.textMuted,
                    }}>
                    {cell.numeral}
                  </AppText>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function calendarMark(mark: DayMark) {
  if (mark === 'done') {
    return { backgroundColor: THEME.accent, borderRadius: 10, minWidth: 28, minHeight: 28, alignItems: 'center' as const, justifyContent: 'center' as const };
  }
  if (mark === 'miss') {
    return { borderWidth: 1.5, borderColor: THEME.circle, borderRadius: 10, minWidth: 28, minHeight: 28, alignItems: 'center' as const, justifyContent: 'center' as const };
  }
  if (mark === 'due') {
    return { borderWidth: 1, borderColor: THEME.accent, borderRadius: 10, minWidth: 28, minHeight: 28, alignItems: 'center' as const, justifyContent: 'center' as const };
  }
  return { minWidth: 28, minHeight: 28, alignItems: 'center' as const, justifyContent: 'center' as const };
}

const calendarCell = { width: '14.28%' as const, alignItems: 'center' as const, paddingVertical: 2 };
const calendarHead = { width: '14.28%' as const, textAlign: 'center' as const, fontSize: 10, fontWeight: '800' as const, color: THEME.textMuted };

function Card({ title, chip, children }: { title: string; chip?: string; children?: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 4,
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText style={{ flex: 1, fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>{title}</AppText>
        {chip ? <Source label={chip} /> : null}
      </View>
      {children}
    </View>
  );
}

function AllowHealth({ onAllowed }: { onAllowed: () => void }) {
  const [asking, setAsking] = useState(false);
  const howTo = healthHowToLine();
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        disabled={asking}
        onPress={() => {
          const provider = getHealthProvider();
          if (!provider) {
            return;
          }
          setAsking(true);
          void provider
            .requestAccess()
            .then(() => onAllowed())
            .finally(() => setAsking(false));
        }}
        style={{
          alignSelf: 'flex-start',
          backgroundColor: THEME.primary,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}>
        <AppText style={{ color: THEME.primaryForeground, fontWeight: '700' }}>{copy('health.allow')}</AppText>
      </Pressable>
      {howTo ? <AppText style={{ color: THEME.textMuted }}>{howTo}</AppText> : null}
    </View>
  );
}

function Source({ label }: { label: string }) {
  return <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>{label}</AppText>;
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
