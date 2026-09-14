import { View } from 'react-native';

import { useTeacherBeginOptional } from '@/components/teacher/TeacherBeginHost';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useBeginTeacher3Day } from '@/hooks/useTeacher3Day';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { useState } from 'react';

export function TeacherStartOverSheet() {
  const host = useTeacherBeginOptional();
  const begin = useBeginTeacher3Day();
  const [error, setError] = useState<string | null>(null);
  const visible = host?.sheet === 'restart';

  if (!host || !visible) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={begin.isPending ? undefined : host.close} align="end">
      <View
        className="px-5 pt-5 pb-6"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          borderWidth: 1,
          borderColor: THEME.border,
          ...themeShadow(),
        }}>
        <AppText className="text-center text-[22px] font-extrabold text-charcoal">
          Start 3-Day over?
        </AppText>
        {error ? (
          <AppText className="mt-2 text-center text-[13px]" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}
        <View className="mt-5 gap-2">
          <Button
            title="Start over"
            size="lg"
            loading={begin.isPending}
            onPress={() => {
              setError(null);
              void begin
                .mutateAsync(true)
                .then(() => host.close())
                .catch((caught) => setError(getErrorMessage(caught)));
            }}
          />
          <Button title="Not now" variant="ghost" size="lg" onPress={host.close} disabled={begin.isPending} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
