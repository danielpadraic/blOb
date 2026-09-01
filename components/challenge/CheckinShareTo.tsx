import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

type CheckinShareToProps = {
  hideHome?: boolean;
  shareHome: boolean;
  onShareHomeChange: (value: boolean) => void;
  shareWave: boolean;
  onShareWaveChange: (value: boolean) => void;
};

function CompactToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: value ? THEME.accentSoft : THEME.surface,
        borderColor: value ? THEME.accent : THEME.border,
      }}>
      <AppText
        className="text-[13px] font-bold"
        style={{ color: value ? THEME.accent : THEME.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function CheckinShareTo({
  hideHome,
  shareHome,
  onShareHomeChange,
  shareWave,
  onShareWaveChange,
}: CheckinShareToProps) {
  return (
    <View
      className="flex-row items-center"
      style={{ paddingTop: 6, paddingHorizontal: 12, gap: 8, minHeight: 36 }}>
      <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }}>
        {copy('checkin.alsoLive')}
      </AppText>
      <View className="flex-1" />
      {hideHome ? null : (
        <CompactToggle label={copy('checkin.shareHome')} value={shareHome} onChange={onShareHomeChange} />
      )}
      <CompactToggle label={copy('checkin.shareWave')} value={shareWave} onChange={onShareWaveChange} />
    </View>
  );
}
