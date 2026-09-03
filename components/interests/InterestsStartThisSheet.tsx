import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { copy, type CopyTone } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

type InterestsStartThisSheetProps = {
  visible: boolean;
  chipLabel: string;
  tone: CopyTone;
  loading?: boolean;
  onStart: () => void;
  onNotNow: () => void;
};

export function InterestsStartThisSheet({
  visible,
  chipLabel,
  tone,
  loading = false,
  onStart,
  onNotNow,
}: InterestsStartThisSheetProps) {
  if (!visible) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={onNotNow} align="center" dim="heavy" zIndex={210}>
      <View
        className="mx-4 px-5 py-5"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          ...themeShadow(),
        }}>
        <AppText className="text-center text-[22px] font-extrabold text-charcoal">
          {copy('interests.startThisTitle', tone, { chip: chipLabel })}
        </AppText>
        <View className="mt-4 gap-2">
          <Button
            title={copy('interests.startThisCta', tone)}
            size="lg"
            loading={loading}
            onPress={onStart}
          />
          <Button title={copy('interests.startThisNotNow', tone)} variant="ghost" onPress={onNotNow} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
