import { Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

type CheckinShareToProps = {
  lobbyName: string;
  lobbyLocked?: boolean;
  shareHome: boolean;
  onShareHomeChange: (value: boolean) => void;
};

function ShareRow({
  label,
  value,
  detail,
  locked,
  onChange,
}: {
  label: string;
  value: boolean;
  detail?: string;
  locked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <View
      className="flex-row items-center"
      style={{ minHeight: 44, paddingVertical: 4, gap: 12 }}>
      <View className="min-w-0 flex-1">
        <AppText className="text-[15px] font-semibold" style={{ color: THEME.textPrimary }}>
          {label}
        </AppText>
        {detail ? (
          <AppText className="text-[13px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {locked ? (
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
          On
        </AppText>
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: THEME.border, true: THEME.accentBright }}
          thumbColor={value ? THEME.accent : '#fff'}
          ios_backgroundColor={THEME.border}
          accessibilityLabel={label}
        />
      )}
    </View>
  );
}

export function CheckinShareTo({
  lobbyName,
  lobbyLocked,
  shareHome,
  onShareHomeChange,
}: CheckinShareToProps) {
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 12 }}>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
        {copy('checkin.shareTo')}
      </AppText>
      <ShareRow label={copy('checkin.shareLobby')} value detail={lobbyName} locked />
      {lobbyLocked ? null : (
        <ShareRow
          label={copy('checkin.shareHome')}
          value={shareHome}
          onChange={onShareHomeChange}
        />
      )}
    </View>
  );
}
