import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';

import { InviteToChallengeModal } from '@/components/challenge/InviteToChallengeModal';
import { AppText } from '@/components/ui/AppText';
import { shareOfficialChallenge } from '@/lib/officialShare';
import { THEME, themeShadow } from '@/lib/theme';

type InviteTarget = {
  challengeId: string;
  challengeTitle: string;
  shareLink?: boolean;
};

type InviteHostValue = {
  open: (target: InviteTarget) => void;
};

const InviteHostContext = createContext<InviteHostValue | null>(null);

export function useInviteHost(): InviteHostValue | null {
  return useContext(InviteHostContext);
}

export function InviteHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<InviteTarget | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const open = useCallback((next: InviteTarget) => {
    setTarget(next);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2200);
  }

  return (
    <InviteHostContext.Provider value={value}>
      {children}
      <InviteToChallengeModal
        visible={Boolean(target)}
        challengeId={target?.challengeId ?? ''}
        challengeTitle={target?.challengeTitle ?? 'this challenge'}
        shareBusy={shareBusy}
        onShareLink={
          target?.shareLink
            ? () => {
                if (!target) {
                  return;
                }
                setShareBusy(true);
                void shareOfficialChallenge(target.challengeId)
                  .then((result) => {
                    if (result === 'copied') {
                      showToast('Link copied.');
                    }
                  })
                  .finally(() => setShareBusy(false));
              }
            : undefined
        }
        onSent={(names) => {
          if (names.length === 1) {
            showToast(`Invite sent to ${names[0]}.`);
            return;
          }
          if (names.length === 2) {
            showToast(`Invite sent to ${names[0]} and ${names[1]}.`);
            return;
          }
          showToast(`Invite sent to ${names[0]} and ${names.length - 1} others.`);
        }}
        onClose={() => setTarget(null)}
      />
      {toast ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 108, zIndex: 80 }}>
          <View
            className="mx-8 items-center px-4 py-2.5"
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}
    </InviteHostContext.Provider>
  );
}
