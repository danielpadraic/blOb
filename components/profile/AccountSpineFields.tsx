import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { HomeStatePickerSheet, homeStateRowLabel } from '@/components/geo/HomeStatePickerSheet';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { formatDateOnly, parseDateOnly } from '@/lib/officialDob';
import { parseUspsRegion, type UspsRegion } from '@/lib/geo/regions';
import { THEME } from '@/lib/theme';

export function AccountSpineFields({
  dateOfBirth,
  region,
  phone,
  onDob,
  onRegion,
  onPhone,
  dobError,
  regionError,
  phoneError,
}: {
  dateOfBirth?: string | null;
  region?: string | null;
  phone?: string | null;
  onDob: (value: string) => void;
  onRegion: (value: UspsRegion) => void;
  onPhone: (value: string) => void;
  dobError?: string;
  regionError?: string;
  phoneError?: string;
}) {
  const parsedDob = parseDateOnly(dateOfBirth);
  const [draft, setDraft] = useState(parsedDob ?? new Date(2000, 0, 1));
  const [nativeOpen, setNativeOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const iso = formatDateOnly(draft);
  const hasDob = Boolean(parsedDob);
  const webValue = useMemo(() => (hasDob ? iso : ''), [hasDob, iso]);

  function onNativeChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') {
      setNativeOpen(false);
      if (event.type !== 'set' || !next) {
        return;
      }
      setDraft(next);
      onDob(formatDateOnly(next));
      return;
    }
    if (next) {
      setDraft(next);
      onDob(formatDateOnly(next));
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-2">
        <AppText className="text-sm font-semibold text-charcoal">{copy('interests.dob')}</AppText>
        {Platform.OS === 'web' ? (
          <View>
            {createWebDate(webValue, (next) => {
              const parsed = parseDateOnly(next);
              if (!parsed) {
                return;
              }
              setDraft(parsed);
              onDob(formatDateOnly(parsed));
            })}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('interests.dob')}
            onPress={() => setNativeOpen(true)}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm leading-5 text-charcoal">
              {hasDob ? iso : 'Add later'}
            </AppText>
          </Pressable>
        )}
        <AppText className="text-[12px] leading-5 text-muted">{copy('interests.dobHelp')}</AppText>
        {dobError ? (
          <AppText className="text-xs text-coral-dark">{dobError}</AppText>
        ) : null}
        {nativeOpen && Platform.OS !== 'web' ? (
          <DateTimePicker
            value={draft}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={onNativeChange}
          />
        ) : null}
      </View>

      <View className="gap-2">
        <AppText className="text-sm font-semibold text-charcoal">{copy('geo.homeState')}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('geo.homeState')}
          onPress={() => setStateOpen(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-sm leading-5 text-charcoal">{homeStateRowLabel(region)}</AppText>
        </Pressable>
        <AppText className="text-[12px] leading-5 text-muted">{copy('geo.homeStateHelp')}</AppText>
        {regionError ? (
          <AppText className="text-xs text-coral-dark">{regionError}</AppText>
        ) : null}
      </View>

      <Input
        label="Phone"
        keyboardType="phone-pad"
        inputMode="tel"
        textContentType="telephoneNumber"
        autoComplete="tel"
        value={phone ?? ''}
        onChangeText={onPhone}
        error={phoneError}
        hint="Private. Used so we can place you later."
      />

      <HomeStatePickerSheet
        visible={stateOpen}
        value={parseUspsRegion(region)}
        onSave={(next) => {
          onRegion(next);
          setStateOpen(false);
        }}
        onClose={() => setStateOpen(false)}
      />
    </View>
  );
}

function createWebDate(value: string, onChange: (next: string) => void) {
  if (Platform.OS !== 'web') {
    return null;
  }
  return (
    // @ts-expect-error web-only input
    <input
      type="date"
      value={value}
      max={formatDateOnly(new Date())}
      onChange={(event: { target?: { value?: string } }) => onChange(String(event.target?.value ?? ''))}
      style={{
        minHeight: 44,
        width: '100%',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.border,
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: 15,
        color: THEME.textPrimary,
        backgroundColor: THEME.surface,
      }}
    />
  );
}
