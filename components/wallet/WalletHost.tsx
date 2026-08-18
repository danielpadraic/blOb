import { BadgeUnlockModal } from '@/components/wallet/BadgeUnlockModal';
import { WalletSheet } from '@/components/wallet/WalletSheet';

export function WalletHost() {
  return (
    <>
      <WalletSheet />
      <BadgeUnlockModal />
    </>
  );
}
