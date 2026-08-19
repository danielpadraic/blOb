import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

type FriendsHeaderProps = {
  friendCount: number;
  requestCount: number;
};

export function FriendsHeader({ friendCount, requestCount }: FriendsHeaderProps) {
  const subtitle =
    requestCount > 0
      ? `${friendCount} friend${friendCount === 1 ? '' : 's'} · ${requestCount} waiting`
      : friendCount > 0
        ? `${friendCount} friend${friendCount === 1 ? '' : 's'} to compete with`
        : 'Find people to challenge';

  return (
    <View className="mb-3">
      <AppText className="text-[22px] font-extrabold text-charcoal">Friends</AppText>
      <AppText className="mt-0.5 text-[13px] text-muted">{subtitle}</AppText>
    </View>
  );
}
