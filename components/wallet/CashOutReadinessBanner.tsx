import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { cashOutBannerAction } from '@/lib/wallet/settlement';

type Props = {
  bucks?: number | null;
  pending?: number | null;
  hasAddress?: boolean;
  onBeforeNavigate?: () => void;
};

export function CashOutReadinessBanner({ bucks, pending, hasAddress, onBeforeNavigate }: Props) {
  const router = useRouter();
  const action = cashOutBannerAction({ bucks, pending, hasAddress });

  return (
    <View
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: THEME.radius,
        backgroundColor: THEME.accentSoft,
      }}>
      <AppText className="text-[14px] leading-5" style={{ color: THEME.textPrimary }}>
        Cash out opens once identity verification is complete. You’ll be able to move money to your bank in minutes.
      </AppText>
      {action ? (
        <View className="mt-3">
          <Button
            title={action.label}
            size="md"
            onPress={() => {
              onBeforeNavigate?.();
              router.push(action.href as Href);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
