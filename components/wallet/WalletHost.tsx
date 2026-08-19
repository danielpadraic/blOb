import { View } from 'react-native';

import { BadgeUnlockModal } from '@/components/wallet/BadgeUnlockModal';
import { SendCoinsSheet } from '@/components/wallet/SendCoinsSheet';
import { TopUpSheet } from '@/components/wallet/TopUpSheet';
import { WalletSheet } from '@/components/wallet/WalletSheet';
import { AppText } from '@/components/ui/AppText';
import { useWallet } from '@/hooks/useWallet';
import { THEME, themeShadow } from '@/lib/theme';

export function WalletHost() {
  const { sentToast } = useWallet();

  return (
    <>
      <WalletSheet />
      <SendCoinsSheet />
      <TopUpSheet />
      <BadgeUnlockModal />
      {sentToast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 96, zIndex: 80 }}>
          <View
            className="mx-8 items-center px-4 py-2.5"
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {sentToast}
            </AppText>
          </View>
        </View>
      ) : null}
    </>
  );
}
