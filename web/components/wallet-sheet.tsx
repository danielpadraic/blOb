'use client';

import { useEffect, useState } from 'react';

import { ledgerReceiptLabel } from '@/lib/funding';
import { formatCash, formatWallet } from '@/lib/currency';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { requestWebTopUp } from '~/components/wallet-top-up';
import { supabase } from '~/lib/supabase';

type LedgerRow = {
  id: string;
  amount: number | null;
  currency: string | null;
  entry_type: string | null;
  created_at: string;
};

export function WalletSheetHost({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [bucks, setBucks] = useState(0);
  const [coins, setCoins] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);

  async function load() {
    const profile = await supabase
      .from('profiles')
      .select('coins, bucks')
      .eq('id', userId)
      .maybeSingle();
    if (profile.data) {
      setCoins(Number((profile.data as { coins?: number }).coins ?? 0));
      setBucks(Number((profile.data as { bucks?: number }).bucks ?? 0));
    }
    const history = await supabase
      .from('wallet_ledger')
      .select('id, amount, currency, entry_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12);
    setRows((history.data ?? []) as LedgerRow[]);
  }

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      void load();
    };
    const onRefresh = () => void load();
    window.addEventListener('blob-wallet', onOpen);
    window.addEventListener('blob-wallet-refresh', onRefresh);
    return () => {
      window.removeEventListener('blob-wallet', onOpen);
      window.removeEventListener('blob-wallet-refresh', onRefresh);
    };
  }, [userId]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/20">
      <div className="max-h-[88%] w-full overflow-y-auto rounded-t-[22px] bg-bg px-5 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-center text-lg font-bold text-ink">Wallet</h2>
        <div className="mt-3 flex gap-2">
          <Card className="flex-1">
            <p className="text-[12px] font-bold uppercase tracking-widest text-muted">Coins</p>
            <p className="mt-1 text-[15px] font-extrabold text-ink">{coins}</p>
          </Card>
          <Card className="flex-1">
            <p className="text-[12px] font-bold uppercase tracking-widest text-muted">$</p>
            <p className="mt-1 text-[15px] font-extrabold text-[#1B7A4A]">{formatCash(bucks)}</p>
          </Card>
        </div>
        {rows.length > 0 ? (
          <div className="mt-5">
            <p className="text-[12px] font-bold uppercase tracking-widest text-ink">Receipts</p>
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((row) => (
                <Card key={row.id} className="flex min-h-11 items-center justify-between">
                  <p className="text-[14px] font-bold text-ink">{ledgerReceiptLabel(row.entry_type)}</p>
                  <p className="text-[14px] font-bold text-ink">
                    {String(row.currency) === 'bucks'
                      ? formatCash(row.amount)
                      : formatWallet(row.amount, row.currency)}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
        <p className="mt-4 text-[13px] leading-5 text-muted">This is real money, 1:1 with USD.</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              requestWebTopUp({ amount: 1 });
            }}>
            Add $1.00
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
