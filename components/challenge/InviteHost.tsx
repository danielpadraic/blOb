import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { InviteToChallengeModal } from '@/components/challenge/InviteToChallengeModal';
import { Composer } from '@/components/feed/Composer';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useCreatePost } from '@/hooks/useFeed';
import { challengeAnnounceCopy } from '@/lib/challengeFeedPost';
import { challengeShareUrl } from '@/lib/officialShare';
import type { PostAudience } from '@/lib/postAudience';
import type { FeedChallengePreview } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export type ChallengeShareTarget = {
  challengeId: string;
  challengeTitle: string;
  allowSendToPeople?: boolean;
  defaultAudience?: PostAudience;
  preview?: FeedChallengePreview | null;
};

type InviteHostValue = {
  open: (target: ChallengeShareTarget) => void;
};

const InviteHostContext = createContext<InviteHostValue | null>(null);

export function useInviteHost(): InviteHostValue | null {
  return useContext(InviteHostContext);
}

type Panel = 'menu' | 'feed' | 'people';

const FEED_AUDIENCE = [
  { value: 'friends' as const, label: 'Friends' },
  { value: 'public' as const, label: 'Public' },
];

export function InviteHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ChallengeShareTarget | null>(null);
  const [panel, setPanel] = useState<Panel>('menu');
  const [toast, setToast] = useState<string | null>(null);
  const createPost = useCreatePost();

  const open = useCallback((next: ChallengeShareTarget) => {
    setTarget(next);
    setPanel('menu');
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2200);
  }

  function close() {
    setTarget(null);
    setPanel('menu');
  }

  async function copyLink() {
    if (!target) {
      return;
    }
    try {
      await Clipboard.setStringAsync(challengeShareUrl(target.challengeId));
      close();
      showToast('Link copied.');
    } catch (error) {
      Alert.alert('Couldn’t copy that', getErrorMessage(error));
    }
  }

  const preview: FeedChallengePreview | null = target
    ? target.preview ?? {
        id: target.challengeId,
        title: target.challengeTitle,
        status: 'open',
        is_official: false,
        buy_in_amount: 0,
        prize_pool: 0,
        currency: null,
        cover_image_url: null,
        created_by: null,
      }
    : null;

  return (
    <InviteHostContext.Provider value={value}>
      {children}
      <ChromeOverlay visible={Boolean(target) && panel === 'menu'} onClose={close}>
        <View
          className="px-5 pt-4"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            paddingBottom: 16,
          }}>
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          </View>
          <AppText className="text-xl font-bold text-charcoal">Share</AppText>
          <AppText className="mt-1 mb-4 text-muted">
            {target?.challengeTitle ?? 'this challenge'}
          </AppText>
          <View className="gap-2">
            <Button title="Share to feed" size="lg" onPress={() => setPanel('feed')} />
            {target?.allowSendToPeople !== false ? (
              <Button
                title="Send to people"
                size="lg"
                variant="outline"
                onPress={() => setPanel('people')}
              />
            ) : null}
            <Button title="Copy link" size="lg" variant="outline" onPress={() => void copyLink()} />
            <Button title="Close" variant="ghost" onPress={close} />
          </View>
        </View>
      </ChromeOverlay>
      <ChromeOverlay visible={Boolean(target) && panel === 'feed'} onClose={close} align="start">
        <View
          className="px-4 pt-4"
          style={{
            backgroundColor: THEME.surface,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            paddingBottom: 16,
            maxHeight: '100%',
          }}>
          <AppText className="mb-3 text-[16px] font-extrabold text-charcoal">Share to feed</AppText>
          {target && preview ? (
            <Composer
              autoFocus
              submitting={createPost.isPending}
              placeholder="Add a caption…"
              initialText={challengeAnnounceCopy(target.challengeTitle)}
              attachedChallenge={preview}
              audienceOptions={FEED_AUDIENCE}
              defaultAudience={target.defaultAudience ?? 'public'}
              onSubmit={async (input) => {
                await createPost.mutateAsync({
                  ...input,
                  challengeId: target.challengeId,
                  audience: input.audience === 'friends' ? 'friends' : 'public',
                  source: 'share',
                });
                close();
                showToast('Shared to feed.');
              }}
            />
          ) : null}
          <View className="mt-2">
            <Button title="Back" variant="ghost" onPress={() => setPanel('menu')} />
          </View>
        </View>
      </ChromeOverlay>
      <InviteToChallengeModal
        visible={Boolean(target) && panel === 'people'}
        challengeId={target?.challengeId ?? ''}
        challengeTitle={target?.challengeTitle ?? 'this challenge'}
        onSent={(names) => {
          close();
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
        onClose={() => setPanel('menu')}
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
