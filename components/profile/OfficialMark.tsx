import { View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { isOfficialAccount } from '@/lib/official';
import { THEME } from '@/lib/theme';

type OfficialMarkProps = {
  profile?: { is_official?: boolean | null } | null;
  compact?: boolean;
};

export function OfficialMark({ profile, compact }: OfficialMarkProps) {
  if (!isOfficialAccount(profile)) {
    return null;
  }

  if (compact) {
    return (
      <View
        accessibilityLabel={copy('official.badge')}
        className="h-4 w-4 items-center justify-center">
        <Glyph name={GLYPH.check} color={THEME.accent} size={14} />
      </View>
    );
  }

  return (
    <View
      className="self-start rounded-full px-2 py-0.5"
      style={{ backgroundColor: THEME.accentSoft }}>
      <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
        {copy('official.badge')}
      </AppText>
    </View>
  );
}
