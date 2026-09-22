import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TextInput, View } from 'react-native';

import { InviteToChallengeModal } from '@/components/challenge/InviteToChallengeModal';
import { CircleShareSheet } from '@/components/circles/CircleShareSheet';
import { Composer } from '@/components/feed/Composer';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useMyCircles } from '@/hooks/useCircles';
import { useCreatePost } from '@/hooks/useFeed';
import { challengeAnnounceCopy } from '@/lib/challengeFeedPost';
import { mintChallengeInviteLink } from '@/lib/challengeInvites';
import { needsInviteShareLink, resolveChallengeCopyUrl } from '@/lib/challengeInviteShare';
import { copyTextToClipboard } from '@/lib/clipboardCopy';
import { copy } from '@/lib/copy';
import { isPrivateCorporate } from '@/lib/privacyMode';
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
  privacyMode?: string | null;
};

type InviteHostValue = {
  open: (target: ChallengeShareTarget) => void;
};

const InviteHostContext = createContext<InviteHostValue | null>(null);

export function useInviteHost(): InviteHostValue | null {
  return useContext(InviteHostContext);
}

type Panel = 'menu' | 'feed' | 'people' | 'circle';

const FEED_AUDIENCE = [
  { value: 'friends' as const, label: 'Friends' },
  { value: 'public' as const, label: 'Public' },
];

export function InviteHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ChallengeShareTarget | null>(null);
  const [panel, setPanel] = useState<Panel>('menu');
  const [toast, setToast] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const inviteTokenRef = useRef<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const mintInFlight = useRef<Promise<string> | null>(null);
  const mintForId = useRef<string | null>(null);
  const createPost = useCreatePost();
  const myCircles = useMyCircles();
  const inACircle = (myCircles.data ?? []).length > 0;
  const corporateBlocked = isPrivateCorporate(target?.privacyMode);

  const rememberToken = useCallback((token: string) => {
    inviteTokenRef.current = token;
    setInviteToken(token);
  }, []);

  const ensureInviteToken = useCallback((challengeId: string) => {
    if (inviteTokenRef.current) {
      return Promise.resolve(inviteTokenRef.current);
    }
    if (mintInFlight.current) {
      return mintInFlight.current;
    }
    const pending = mintChallengeInviteLink(challengeId)
      .then((row) => {
        const token = String(row.token ?? '').trim();
        if (!token) {
          throw new Error('Couldn’t copy that invite.');
        }
        if (mintForId.current === challengeId) {
          rememberToken(token);
        }
        return token;
      })
      .finally(() => {
        if (mintInFlight.current === pending) {
          mintInFlight.current = null;
        }
      });
    mintInFlight.current = pending;
    return pending;
  }, [rememberToken]);

  const open = useCallback(
    (next: ChallengeShareTarget) => {
      setTarget(next);
      setPanel('menu');
      setCopyError(null);
      setManualUrl(null);
      inviteTokenRef.current = null;
      setInviteToken(null);
      mintInFlight.current = null;
      mintForId.current = next.challengeId;
      if (needsInviteShareLink(next.privacyMode)) {
        void ensureInviteToken(next.challengeId).catch(() => {
          // Copy Link will mint again in the tap, or show the URL if it still fails.
        });
      }
    },
    [ensureInviteToken],
  );

  const value = useMemo(() => ({ open }), [open]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2200);
  }

  function close() {
    setTarget(null);
    setPanel('menu');
    setCopyError(null);
    setManualUrl(null);
  }

  async function copyLink() {
    if (!target) {
      return;
    }
    setCopyError(null);
    setManualUrl(null);
    let token = inviteTokenRef.current ?? inviteToken;
    try {
      if (needsInviteShareLink(target.privacyMode) && !token) {
        token = await ensureInviteToken(target.challengeId);
      }
    } catch (error) {
      setCopyError(getErrorMessage(error) || 'Couldn’t copy. Hold to select.');
      return;
    }
    const url = resolveChallengeCopyUrl({
      challengeId: target.challengeId,
      privacyMode: target.privacyMode,
      inviteToken: token,
    });
    if (!url) {
      setCopyError('Couldn’t copy. Hold to select.');
      return;
    }
    const copied = await copyTextToClipboard(url);
    if (copied) {
      close();
      showToast('Link copied');
      return;
    }
    setManualUrl(url);
    setCopyError('Couldn’t copy. Hold to select.');
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
            {corporateBlocked ? null : (
              <Button title="Share to feed" size="lg" onPress={() => setPanel('feed')} />
            )}
            {target?.allowSendToPeople !== false ? (
              <Button
                title="Send to people"
                size="lg"
                variant="outline"
                onPress={() => setPanel('people')}
              />
            ) : null}
            {inACircle && !corporateBlocked ? (
              <Button
                title={copy('circles.shareToCircle')}
                size="lg"
                variant="outline"
                onPress={() => setPanel('circle')}
              />
            ) : null}
            <Button title="Copy link" size="lg" variant="outline" onPress={() => void copyLink()} />
            {copyError ? (
              <AppText className="mt-1 text-sm leading-5 text-coral-dark">{copyError}</AppText>
            ) : null}
            {manualUrl ? (
              <TextInput
                value={manualUrl}
                editable={false}
                selectTextOnFocus
                autoFocus
                multiline
                selection={{ start: 0, end: manualUrl.length }}
                accessibilityLabel="Challenge link"
                style={{
                  marginTop: 4,
                  minHeight: 44,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                  color: THEME.textPrimary,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 13,
                }}
              />
            ) : null}
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
      <CircleShareSheet
        visible={Boolean(target) && panel === 'circle'}
        challengeId={target?.challengeId ?? ''}
        challengeTitle={target?.challengeTitle ?? 'this challenge'}
        onSent={() => {
          close();
          showToast(copy('circles.shared'));
        }}
        onClose={() => setPanel('menu')}
      />
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
