import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useUpdateProfile } from '@/hooks/useProfile';
import { formatDateOnly, OFFICIAL_DOB_COPY, parseDateOnly } from '@/lib/officialDob';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

type OfficialDobSheetProps = {
  visible: boolean;
  mode: 'dob_required' | 'underage';
  value?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function OfficialDobSheet({ visible, mode, value, onClose, onSaved }: OfficialDobSheetProps) {
  const updateProfile = useUpdateProfile();
  const initial = parseDateOnly(value) ?? new Date(2000, 0, 1);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [nativeOpen, setNativeOpen] = useState(Platform.OS === 'ios');
  const iso = formatDateOnly(draft);
  const title = mode === 'underage' ? OFFICIAL_DOB_COPY.underageTitle : OFFICIAL_DOB_COPY.missingTitle;
  const body = mode === 'underage' ? OFFICIAL_DOB_COPY.underageBody : OFFICIAL_DOB_COPY.missingBody;

  const webValue = useMemo(() => iso, [iso]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(parseDateOnly(value) ?? new Date(2000, 0, 1));
    setError(null);
    setNativeOpen(Platform.OS === 'ios');
  }, [value, visible]);

  function onNativeChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') {
      setNativeOpen(false);
      if (event.type !== 'set' || !next) {
        return;
      }
      setDraft(next);
      return;
    }
    if (next) {
      setDraft(next);
    }
  }

  async function save() {
    setError(null);
    try {
      await updateProfile.mutateAsync({ date_of_birth: formatDateOnly(draft) });
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={onClose} align="center" dim="heavy" zIndex={220}>
      <View
        className="mx-4 px-5 py-5"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          ...themeShadow(),
        }}>
        <AppText className="text-center text-[22px] font-extrabold text-charcoal">{title}</AppText>
        <AppText className="mt-3 text-center text-[15px] leading-6 text-muted">{body}</AppText>
        {mode === 'dob_required' ? (
          <View className="mt-4">
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={webValue}
                max={formatDateOnly(new Date())}
                onChange={(event) => {
                  const next = parseDateOnly(event.target.value);
                  if (next) {
                    setDraft(next);
                  }
                }}
                style={{
                  minHeight: 48,
                  width: '100%',
                  borderRadius: 14,
                  border: `1px solid ${THEME.border}`,
                  paddingLeft: 12,
                  fontSize: 16,
                }}
              />
            ) : (
              <>
                {Platform.OS === 'android' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setNativeOpen(true)}
                    style={{
                      minHeight: 48,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: THEME.border,
                      justifyContent: 'center',
                      paddingHorizontal: 12,
                    }}>
                    <AppText className="text-[16px] text-charcoal">{iso}</AppText>
                  </Pressable>
                ) : null}
                {nativeOpen || Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={draft}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={onNativeChange}
                  />
                ) : null}
              </>
            )}
            {error ? (
              <AppText className="mt-2 text-center text-[13px]" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
            <View className="mt-4 gap-2">
              <Button
                title="Save birth date"
                size="lg"
                loading={updateProfile.isPending}
                onPress={() => void save()}
              />
              <Button title="Not now" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : (
          <View className="mt-4">
            <Button title="OK" size="lg" onPress={onClose} />
          </View>
        )}
      </View>
    </ChromeOverlay>
  );
}
