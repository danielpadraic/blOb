import { View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { namedOfficialSponsor, officialSponsorName } from '@/lib/challengeSponsor';

export function OfficialSponsorLine({
  challenge,
  muted,
  titleColor,
  compact = false,
}: {
  challenge: {
    sponsor_name?: string | null;
    organization_name?: string | null;
    organization?: string | null;
    is_official?: boolean | null;
  };
  muted: string;
  titleColor?: string;
  compact?: boolean;
}) {
  const named = namedOfficialSponsor(challenge);
  const name = officialSponsorName(challenge);
  if (!name) {
    return null;
  }
  return (
    <View
      className="flex-row items-center"
      style={{ gap: 8, minHeight: compact ? 22 : 28, flexWrap: 'wrap' }}
      accessibilityLabel={`Sponsored by ${name}`}>
      <AppText className="text-[13px] font-semibold" numberOfLines={1} style={{ color: muted }}>
        Sponsored by
      </AppText>
      {named ? (
        <AppText
          className="text-[13px] font-extrabold"
          numberOfLines={2}
          style={{ color: titleColor ?? '#FFFFFF', flexShrink: 1 }}>
          {named}
        </AppText>
      ) : (
        <BlobMascot variant="logo" size={compact ? 44 : 56} />
      )}
    </View>
  );
}
