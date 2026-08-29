import type { ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import {
  defaultFiltersForTab,
  isDefaultLobbyFilters,
  statusOptionsForTab,
  type LobbyCategoryFilter,
  type LobbyCostFilter,
  type LobbyCurrencyFilter,
  type LobbyDuration,
  type LobbyFilterState,
  type LobbyMoreFilter,
  type LobbyStart,
  type LobbyTab,
  type LobbyTypeFilter,
  type LobbyWhen,
} from '@/lib/lobbyChallenge';
import { CHALLENGE_CATEGORIES, CHALLENGE_CATEGORY_LABEL } from '@/lib/constants';
import { THEME } from '@/lib/theme';

type LobbyFilterSheetProps = {
  visible: boolean;
  tab: LobbyTab;
  filters: LobbyFilterState;
  onChange: (next: LobbyFilterState) => void;
  onClose: () => void;
  onDone?: () => void;
};

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        justifyContent: 'center',
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderColor: selected ? THEME.accent : THEME.border,
      }}>
      <AppText
        className="text-[13px] font-semibold"
        style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
        {title}
      </AppText>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

function RangeFields({
  min,
  max,
  minLabel,
  maxLabel,
  onMin,
  onMax,
}: {
  min: number | null;
  max: number | null;
  minLabel: string;
  maxLabel: string;
  onMin: (value: number | null) => void;
  onMax: (value: number | null) => void;
}) {
  return (
    <View className="flex-row" style={{ gap: 8 }}>
      <TextInput
        value={min == null ? '' : String(min)}
        onChangeText={(text) => onMin(text.trim() ? Number(text) : null)}
        placeholder={minLabel}
        placeholderTextColor={THEME.textMuted}
        keyboardType="number-pad"
        style={rangeStyle}
        accessibilityLabel={minLabel}
      />
      <TextInput
        value={max == null ? '' : String(max)}
        onChangeText={(text) => onMax(text.trim() ? Number(text) : null)}
        placeholder={maxLabel}
        placeholderTextColor={THEME.textMuted}
        keyboardType="number-pad"
        style={rangeStyle}
        accessibilityLabel={maxLabel}
      />
    </View>
  );
}

const rangeStyle = {
  flexGrow: 1,
  minHeight: 44,
  paddingHorizontal: 12,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: THEME.border,
  backgroundColor: THEME.surface,
  color: THEME.textPrimary,
  fontSize: 15,
};

export function LobbyFilterSheet({
  visible,
  tab,
  filters,
  onChange,
  onClose,
  onDone,
}: LobbyFilterSheetProps) {
  function setWhen(when: LobbyWhen) {
    onChange({
      ...filters,
      when,
      customFrom: when === 'custom' ? filters.customFrom : null,
      customTo: when === 'custom' ? filters.customTo : null,
    });
  }

  function setStart(start: LobbyStart) {
    onChange({
      ...filters,
      start: filters.start === start ? null : start,
      startFrom: start === 'custom' ? filters.startFrom : null,
      startTo: start === 'custom' ? filters.startTo : null,
    });
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose}>
      <View
        style={{
          maxHeight: '88%',
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-xl font-bold" style={{ color: THEME.textPrimary }}>
          Filters
        </AppText>
        <ScrollView
          style={{ marginTop: 12, maxHeight: 440 }}
          contentContainerStyle={{ gap: 18, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Section title="When">
            <Chip
              label="Upcoming"
              selected={filters.when === 'upcoming'}
              onPress={() => setWhen('upcoming')}
            />
            <Chip label="Past day" selected={filters.when === 'day'} onPress={() => setWhen('day')} />
            <Chip label="Past week" selected={filters.when === 'week'} onPress={() => setWhen('week')} />
            <Chip
              label="Past 30 days"
              selected={filters.when === '30d'}
              onPress={() => setWhen('30d')}
            />
            <Chip label="Past year" selected={filters.when === 'year'} onPress={() => setWhen('year')} />
            <Chip label="All-time" selected={filters.when === 'all'} onPress={() => setWhen('all')} />
            <Chip
              label="Custom"
              selected={filters.when === 'custom'}
              onPress={() => setWhen('custom')}
            />
            {filters.when === 'custom' ? (
              <View className="w-full flex-row" style={{ gap: 8 }}>
                <TextInput
                  value={filters.customFrom ?? ''}
                  onChangeText={(customFrom) => onChange({ ...filters, customFrom: customFrom || null })}
                  placeholder="From YYYY-MM-DD"
                  placeholderTextColor={THEME.textMuted}
                  autoCapitalize="none"
                  style={rangeStyle}
                  accessibilityLabel="Custom from date"
                />
                <TextInput
                  value={filters.customTo ?? ''}
                  onChangeText={(customTo) => onChange({ ...filters, customTo: customTo || null })}
                  placeholder="To YYYY-MM-DD"
                  placeholderTextColor={THEME.textMuted}
                  autoCapitalize="none"
                  style={rangeStyle}
                  accessibilityLabel="Custom to date"
                />
              </View>
            ) : null}
          </Section>

          {tab !== 'ended' ? (
            <Section title="Start">
              <Chip
                label="Started"
                selected={filters.start === 'started'}
                onPress={() => setStart('started')}
              />
              <Chip
                label="Tomorrow"
                selected={filters.start === 'tomorrow'}
                onPress={() => setStart('tomorrow')}
              />
              <Chip
                label="Next 7"
                selected={filters.start === 'next7'}
                onPress={() => setStart('next7')}
              />
              <Chip
                label="Next 30"
                selected={filters.start === 'next30'}
                onPress={() => setStart('next30')}
              />
              <Chip
                label="Custom"
                selected={filters.start === 'custom'}
                onPress={() => setStart('custom')}
              />
              {filters.start === 'custom' ? (
                <View className="w-full flex-row" style={{ gap: 8 }}>
                  <TextInput
                    value={filters.startFrom ?? ''}
                    onChangeText={(startFrom) => onChange({ ...filters, startFrom: startFrom || null })}
                    placeholder="From YYYY-MM-DD"
                    placeholderTextColor={THEME.textMuted}
                    autoCapitalize="none"
                    style={rangeStyle}
                    accessibilityLabel="Start from date"
                  />
                  <TextInput
                    value={filters.startTo ?? ''}
                    onChangeText={(startTo) => onChange({ ...filters, startTo: startTo || null })}
                    placeholder="To YYYY-MM-DD"
                    placeholderTextColor={THEME.textMuted}
                    autoCapitalize="none"
                    style={rangeStyle}
                    accessibilityLabel="Start to date"
                  />
                </View>
              ) : null}
            </Section>
          ) : null}

          <Section title="Duration">
            {([
              ['1-7', '1–7 days'],
              ['8-30', '8–30 days'],
              ['31+', '31+ days'],
              ['custom', 'Custom'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={filters.durations.includes(value)}
                onPress={() =>
                  onChange({
                    ...filters,
                    durations: toggle<LobbyDuration>(filters.durations, value),
                  })
                }
              />
            ))}
            {filters.durations.includes('custom') ? (
              <RangeFields
                min={filters.durationMin}
                max={filters.durationMax}
                minLabel="Min days"
                maxLabel="Max days"
                onMin={(durationMin) => onChange({ ...filters, durationMin })}
                onMax={(durationMax) => onChange({ ...filters, durationMax })}
              />
            ) : null}
          </Section>

          <Section title="Score">
            {([
              ['consistency', 'Consistency'],
              ['points', 'Points'],
              ['official_weekly', 'Official weekly'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={filters.types.includes(value)}
                onPress={() =>
                  onChange({ ...filters, types: toggle<LobbyTypeFilter>(filters.types, value) })
                }
              />
            ))}
          </Section>

          <Section title="Challenge type">
            {CHALLENGE_CATEGORIES.map((value) => (
              <Chip
                key={value}
                label={CHALLENGE_CATEGORY_LABEL[value]}
                selected={filters.categories.includes(value)}
                onPress={() =>
                  onChange({
                    ...filters,
                    categories: toggle<LobbyCategoryFilter>(filters.categories, value),
                  })
                }
              />
            ))}
          </Section>

          <Section title="Currency">
            {([
              ['coins', 'Coins'],
              ['bucks', 'Bucks'],
              ['free', 'Free'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={filters.currencies.includes(value)}
                onPress={() =>
                  onChange({
                    ...filters,
                    currencies: toggle<LobbyCurrencyFilter>(filters.currencies, value),
                  })
                }
              />
            ))}
          </Section>

          <Section title="Cost">
            {([
              ['host_funded', 'Host-funded'],
              ['buy_in', 'Buy-in'],
              ['free', 'Free'],
            ] as const).map(([value, label]) => (
              <Chip
                key={`cost-${value}`}
                label={label}
                selected={filters.costs.includes(value)}
                onPress={() =>
                  onChange({ ...filters, costs: toggle<LobbyCostFilter>(filters.costs, value) })
                }
              />
            ))}
            <RangeFields
              min={filters.costMin}
              max={filters.costMax}
              minLabel="Min entry"
              maxLabel="Max entry"
              onMin={(costMin) => onChange({ ...filters, costMin })}
              onMax={(costMax) => onChange({ ...filters, costMax })}
            />
          </Section>

          <Section title="Status">
            {statusOptionsForTab(tab).map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.statuses.includes(option.value)}
                onPress={() => onChange({ ...filters, statuses: toggle(filters.statuses, option.value) })}
              />
            ))}
          </Section>

          <Section title="More">
            {([
              ['friends', 'Friends in it'],
              ['spots_left', 'Spots left'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={filters.more.includes(value)}
                onPress={() =>
                  onChange({ ...filters, more: toggle<LobbyMoreFilter>(filters.more, value) })
                }
              />
            ))}
          </Section>
        </ScrollView>
        <View className="mt-3" style={{ gap: 8 }}>
          {!isDefaultLobbyFilters(tab, filters) ? (
            <Button
              title="Clear all"
              variant="ghost"
              onPress={() => onChange(defaultFiltersForTab(tab))}
            />
          ) : null}
          <Button
            title="Done"
            onPress={() => {
              onDone?.();
              onClose();
            }}
          />
        </View>
      </View>
    </ChromeOverlay>
  );
}
