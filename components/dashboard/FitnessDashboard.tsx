import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { GoalRing } from '@/components/dashboard/GoalRing';
import { useFriendCount } from '@/hooks/useSocial';
import { sourceChipLabel, useFitnessDashboard, type DashboardChip } from '@/hooks/useFitnessDashboard';
import {
  dismissHomePrompt,
  homePromptVisible,
  hydrateHomePrompt,
  markHomeVisited,
} from '@/lib/dashboard/homePrompt';
import { readDashboardRange, writeDashboardRange } from '@/lib/dashboard/rangeChoice';
import type { DayMark } from '@/lib/dashboard/calendar';
import { cardioLines, exerciseChipNames, muscleChipKeys, muscleLabel, poundChart, poundEmptyCopy } from '@/lib/dashboard/effort';
import { isMuscleKey } from '@/lib/lift/muscles';
import { dashboardZone, type DashboardRange } from '@/lib/dashboard/range';
import {
  daysInMonth,
  daysInYear,
  DEFAULT_RING_GOALS,
  readRingGoals,
  ringProgress,
  ringTotals,
  scaledRingGoal,
  writeRingGoals,
  type GoalCadence,
  type RingGoals,
} from '@/lib/dashboard/ringGoals';
import { isWideDashboardWindow } from '@/lib/dashboard/wide';
import { copy } from '@/lib/copy';
import { healthHowToLine } from '@/lib/health/howTo';
import { getHealthProvider } from '@/services/health';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';
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
  const [muscle, setMuscle] = useState<string | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const [cardioType, setCardioType] = useState<string | null>(null);
  const [barHint, setBarHint] = useState('');
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [goals, setGoals] = useState<RingGoals>(DEFAULT_RING_GOALS);
  const [goalsOpen, setGoalsOpen] = useState(false);
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
    void readRingGoals().then(setGoals);
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
  const muscles = muscleChipKeys(model.effortSessions);
  const exercises = muscle ? exerciseChipNames(model.effortSessions, muscle) : [];
  const pounds = useMemo(
    () => poundChart(model.effortSessions, model.dayKeys, { muscle, exercise }, (day) => day.slice(8, 10)),
    [exercise, model.dayKeys, model.effortSessions, muscle],
  );
  const poundChip = Boolean(muscle || exercise);
  const showPounds = pounds.total > 0 || poundChip;
  const poundEmptyName = exercise ? exercise : muscle && isMuscleKey(muscle) ? muscleLabel(muscle) : muscle;
  const cardio = useMemo(
    () => cardioLines(model.effortSessions, model.dayKeys, cardioType),
    [cardioType, model.dayKeys, model.effortSessions],
  );
  const sleepCard = model.bodyCards.find((card) => card.key === 'sleep') ?? null;
  const bodyCards = model.bodyCards.filter(
    (card) => card.key !== 'sleep' && card.key !== 'move' && card.key !== 'exercise' && card.key !== 'stand',
  );
  const ringZone = dashboardZone(null);
  const ringValues = ringTotals(model.bodyDays, model.dayKeys);
  const goalScale = {
    customDays: model.dayKeys.length,
    monthDays: ringZone ? daysInMonth(new Date(), ringZone) : model.dayKeys.length || 30,
    yearDays: ringZone ? daysInYear(new Date(), ringZone) : 365,
  };
  const ringView = (['move', 'exercise', 'stand'] as const).map((key) => {
    const goal = scaledRingGoal({
      amount: goals[key].amount,
      cadence: goals[key].cadence,
      range,
      ...goalScale,
    });
    const value = ringValues[key];
    const unit = key === 'move' ? 'cal' : key === 'exercise' ? 'min' : 'hr';
    const shown = key === 'stand' ? Math.round(value * 10) / 10 : Math.round(value);
    const goalShown = key === 'stand' ? Math.round(goal * 10) / 10 : Math.round(goal);
    const withUnit = `${shown} ${unit}`;
    return {
      key,
      value,
      progress: ringProgress(value, goal),
      inside: withUnit.length <= 6 ? withUnit : String(shown),
      name: key === 'move' ? 'MOVE' : key === 'exercise' ? 'EXERCISE' : 'STAND',
      compare: `${shown} / ${goalShown} ${unit}`,
      color: key === 'stand' ? THEME.gold : key === 'exercise' ? THEME.circle : THEME.accent,
    };
  });
  const ringSource = model.bodyCards.find((card) => card.key === 'move' || card.key === 'exercise' || card.key === 'stand')?.source;
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
      contentContainerStyle={{ paddingBottom: wide ? 32 : tabBarLift(insets.bottom) + 88, gap: 12 }}>
      <AppText style={{ fontSize: 28, fontWeight: '800', color: THEME.textPrimary }}>You</AppText>
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {RANGES.map((item) => (
          <QuietFilter key={item} label={RANGE_LABEL[item]} on={item === range} onPress={() => chooseRange(item)} />
        ))}
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {PHONE_CHIPS.map((item) => (
          <QuietFilter
            key={item}
            label={item === 'nutrition' ? 'Nutrition · soon' : CHIP_LABEL[item]}
            on={item === chip}
            onPress={() => setChip(item)}
          />
        ))}
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
          <CheckinCalendar
            cells={model.checkinCells}
            marks={model.checkinMarks}
            header={model.checkinHeader}
            onOpen={(day) => {
              const peeks = model.checkinPeeks[day] ?? [];
              if (peeks.length === 0) {
                return;
              }
              setOpenDay(day);
            }}
          />
          {openDay && (model.checkinPeeks[openDay]?.length ?? 0) > 0 ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {model.checkinPeeks[openDay]?.map((item) => (
                <View key={`${openDay}-${item.title}`} style={{ gap: 4 }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{item.title}</AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {item.proofs.map((proof) => (
                      <AppText key={proof} style={{ fontSize: 12, fontWeight: '700', color: THEME.accent }}>
                        {proof}
                      </AppText>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {showFitness && showPounds ? (
        <Card title={`Pounds · ${pounds.totalLabel}`} chip="Lift">
          {pounds.total === 0 && poundEmptyName ? (
            <AppText style={{ color: THEME.textMuted, fontSize: 14 }}>{poundEmptyCopy(poundEmptyName, range)}</AppText>
          ) : null}
          {barHint ? <AppText style={{ color: THEME.textMuted, fontSize: 13 }}>{barHint}</AppText> : null}
          <DayChart
            days={pounds.bars}
            color={THEME.accent}
            onHint={setBarHint}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingRight: 12 }}>
            <QuietFilter
              label="All"
              on={!muscle}
              onPress={() => {
                setMuscle(null);
                setExercise(null);
                setBarHint('');
              }}
            />
            {muscles.map((key) => (
              <QuietFilter
                key={key}
                label={muscleLabel(key)}
                on={muscle === key}
                onPress={() => {
                  setMuscle(key);
                  setExercise(null);
                  setBarHint('');
                }}
              />
            ))}
          </ScrollView>
          {muscle && exercises.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 12 }}>
              <QuietFilter label="All exercises" on={!exercise} onPress={() => { setExercise(null); setBarHint(''); }} />
              {exercises.map((name) => (
                <QuietFilter
                  key={name}
                  label={name}
                  on={exercise === name}
                  onPress={() => {
                    setExercise(name);
                    setBarHint('');
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
        </Card>
      ) : null}

      {showFitness && cardio.lines.length > 0 ? (
        <Card title="Cardio" chip="Lift">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <QuietFilter label="All" on={!cardioType} onPress={() => setCardioType(null)} />
            {cardio.types.map((item) => (
              <QuietFilter key={item.key} label={item.label} on={cardioType === item.key} onPress={() => setCardioType(item.key)} />
            ))}
          </View>
          {cardio.lines.map((line) => (
            <AppText key={line.id} style={{ color: THEME.textPrimary, fontSize: 14 }}>
              {line.text}
            </AppText>
          ))}
        </Card>
      ) : null}

      {showFitness && ringView.some((ring) => ring.value > 0) ? (
        <Card title="Rings" chip={ringSource ? sourceChipLabel(ringSource) : undefined}>
          <Pressable accessibilityRole="button" onPress={() => setGoalsOpen((open) => !open)}>
            <AppText style={{ fontWeight: '700', color: THEME.accent, textDecorationLine: goalsOpen ? 'underline' : 'none' }}>
              Goals
            </AppText>
          </Pressable>
          {goalsOpen ? (
            <View style={{ gap: 10 }}>
              <GoalField
                label="Move (calories)"
                amount={String(goals.move.amount)}
                cadence={goals.move.cadence}
                onAmount={(amount) => setGoals((current) => ({ ...current, move: { ...current.move, amount } }))}
                onCadence={(cadence) => setGoals((current) => ({ ...current, move: { ...current.move, cadence } }))}
              />
              <GoalField
                label="Exercise (minutes)"
                amount={String(goals.exercise.amount)}
                cadence={goals.exercise.cadence}
                onAmount={(amount) => setGoals((current) => ({ ...current, exercise: { ...current.exercise, amount } }))}
                onCadence={(cadence) => setGoals((current) => ({ ...current, exercise: { ...current.exercise, cadence } }))}
              />
              <GoalField
                label="Stand (hours)"
                amount={String(goals.stand.amount)}
                cadence={goals.stand.cadence}
                onAmount={(amount) => setGoals((current) => ({ ...current, stand: { ...current.stand, amount } }))}
                onCadence={(cadence) => setGoals((current) => ({ ...current, stand: { ...current.stand, cadence } }))}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  writeRingGoals(goals);
                  setGoalsOpen(false);
                }}>
                <AppText style={{ fontWeight: '800', color: THEME.textPrimary }}>Save</AppText>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            {ringView
              .filter((ring) => ring.value > 0)
              .map((ring) => (
                <GoalRing
                  key={ring.key}
                  progress={ring.progress}
                  valueText={ring.inside}
                  name={ring.name}
                  compare={ring.compare}
                  color={ring.color}
                />
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
          chip={sleepCard.source ? sourceChipLabel(sleepCard.source) : undefined}
        />
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

function DayChart({
  days,
  color,
  onHint,
}: {
  days: Array<{ key: string; label: string; value: number; hint?: string }>;
  color: string;
  onHint?: (hint: string) => void;
}) {
  const max = Math.max(...days.map((day) => day.value), 1);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 }}>
        {days.map((day) => (
          <Pressable
            key={day.key}
            accessibilityRole="button"
            accessibilityLabel={day.hint || day.label}
            onPress={() => onHint?.(day.hint || '')}
            {...(Platform.OS === 'web' ? { onHoverIn: () => onHint?.(day.hint || '') } : {})}
            style={{ width: 22, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View
              style={{
                width: 12,
                height: day.value > 0 ? Math.max(4, Math.round((day.value / max) * 40)) : 2,
                backgroundColor: day.value > 0 ? color : THEME.border,
                borderRadius: 4,
              }}
            />
            <AppText style={{ color: THEME.textMuted, marginTop: 2, fontSize: 10 }}>{day.label}</AppText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const WEEKDAY_HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function CheckinCalendar({
  cells,
  marks,
  header,
  onOpen,
}: {
  cells: Array<{ key: string | null; numeral: string; weekday: string }>;
  marks: Record<string, DayMark>;
  header: boolean;
  onOpen?: (day: string) => void;
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
            <Pressable
              key={cell.key ?? `pad-${index}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              disabled={!cell.key}
              onPress={() => {
                if (cell.key) {
                  onOpen?.(cell.key);
                }
              }}
              style={calendarCell}>
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
            </Pressable>
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

function GoalField({
  label,
  amount,
  cadence,
  onAmount,
  onCadence,
}: {
  label: string;
  amount: string;
  cadence: GoalCadence;
  onAmount: (amount: number) => void;
  onCadence: (cadence: GoalCadence) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{label}</AppText>
      <TextInput
        value={amount}
        onChangeText={(text) => {
          const next = Number(text.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(next)) {
            onAmount(next);
          }
        }}
        keyboardType="decimal-pad"
        style={dateField}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(['daily', 'weekly', 'monthly'] as const).map((item) => (
          <QuietFilter
            key={item}
            label={item === 'daily' ? 'Daily' : item === 'weekly' ? 'Weekly' : 'Monthly'}
            on={cadence === item}
            onPress={() => onCadence(item)}
          />
        ))}
      </View>
    </View>
  );
}

function QuietFilter({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        paddingVertical: 4,
        borderBottomWidth: on ? 2 : 0,
        borderBottomColor: THEME.accent,
      }}>
      <AppText style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? THEME.textPrimary : THEME.textMuted }}>
        {label}
      </AppText>
    </Pressable>
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
