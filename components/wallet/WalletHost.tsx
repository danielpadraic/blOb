import { BadgeUnlockModal } from '@/components/wallet/BadgeUnlockModal';
import { SendCoinsSheet } from '@/components/wallet/SendCoinsSheet';
import { WalletSheet } from '@/components/wallet/WalletSheet';

export function WalletHost() {
  return (
    <>
      <WalletSheet />
      <SendCoinsSheet />
      <BadgeUnlockModal />
    </>
  );
}
