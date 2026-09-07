import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useStalled } from '@/hooks/useStalled';
import {
  useMyBlocks,
  useMyMutes,
  useToggleMute,
  useUnblockUser,
  type ModeratedPerson,
} from '@/hooks/usePostModeration';
import { confirmDestructive } from '@/lib/confirm';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { TAB_BAR_PEEK, THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export default function BlockedAndMutedScreen() {
  const router = useRouter();
  const blocks = useMyBlocks();
  const mutes = useMyMutes();
  const unblock = useUnblockUser();
  const toggleMute = useToggleMute();
  const [pending, setPending] = useState<string | null>(null);

  const loading = blocks.isPending || mutes.isPending;
  const stalled = useStalled(loading);
  const failed = Boolean(blocks.error || mutes.error) || stalled;

  const blockedIds = useMemo(
    () => new Set((blocks.data ?? []).map((row) => row.userId)),
    [blocks.data],
  );
  // Blocking mutes too. Showing those rows again here would read as a bug.
  const mutedOnly = useMemo(
    () => (mutes.data ?? []).filter((row) => !blockedIds.has(row.userId)),
    [blockedIds, mutes.data],
  );

  function openProfile(person: ModeratedPerson) {
    const username = person.profile?.username;
    if (username) {
      router.push({ pathname: '/profile/u/[username]', params: { username } });
    }
  }

  function onUnblock(person: ModeratedPerson) {
    setPending(person.userId);
    unblock.mutate(person.userId, {
      onSettled: () => setPending(null),
      onError: (error) => Alert.alert(copy('block.unblockFailed'), getErrorMessage(error)),
    });
  }

  function onUnmute(person: ModeratedPerson) {
    setPending(person.userId);
    toggleMute.mutate(
      { userId: person.userId, muted: true },
      {
        onSettled: () => setPending(null),
        onError: (error) => Alert.alert(copy('mute.failed'), getErrorMessage(error)),
      },
    );
  }

  if (failed) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title="Couldn’t load that list"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void blocks.refetch();
            void mutes.refetch();
          }}
          compact
        />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <MascotState kind="loading" title="Loading…" compact />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-4"
        contentContainerStyle={{ paddingBottom: 24 + TAB_BAR_PEEK }}
        showsVerticalScrollIndicator={false}>
        <AppText className="mb-4 text-[22px] font-extrabold text-charcoal">
          {copy('block.manageTitle')}
        </AppText>

        <Section
          title={copy('block.blockedSection')}
          help={copy('block.blockedHelp')}
          count={(blocks.data ?? []).length}>
          {(blocks.data ?? []).length === 0 ? (
            <EmptyRow label={copy('block.blockedEmpty')} />
          ) : (
            (blocks.data ?? []).map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                actionLabel={copy('block.unblock')}
                busy={pending === person.userId}
                onAction={() =>
                  confirmDestructive({
                    title: `${copy('block.unblock')} ${personDisplayName(person.profile)}?`,
                    confirmLabel: copy('block.unblock'),
                    onConfirm: () => onUnblock(person),
                  })
                }
                onOpen={() => openProfile(person)}
              />
            ))
          )}
        </Section>

        <Section
          title={copy('block.mutedSection')}
          help={copy('block.mutedHelp')}
          count={mutedOnly.length}>
          {mutedOnly.length === 0 ? (
            <EmptyRow label={copy('block.mutedEmpty')} />
          ) : (
            mutedOnly.map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                actionLabel={copy('mute.unmute')}
                busy={pending === person.userId}
                onAction={() => onUnmute(person)}
                onOpen={() => openProfile(person)}
              />
            ))
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  help,
  count,
  children,
}: {
  title: string;
  help: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6 gap-2">
      <View className="flex-row items-center gap-2">
        <AppText className="text-[15px] font-extrabold text-charcoal">{title}</AppText>
        {count > 0 ? (
          <View
            className="items-center justify-center px-2"
            style={{ minHeight: 20, borderRadius: 10, backgroundColor: THEME.accentSoft }}>
            <AppText className="text-[12px] font-extrabold" style={{ color: THEME.accent }}>
              {count}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText className="text-[12px] leading-5" style={{ color: THEME.textMuted }}>
        {help}
      </AppText>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        {children}
      </View>
    </View>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <View className="px-4 py-4">
      <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
        {label}
      </AppText>
    </View>
  );
}

function PersonRow({
  person,
  actionLabel,
  busy,
  onAction,
  onOpen,
}: {
  person: ModeratedPerson;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
  onOpen: () => void;
}) {
  const name = personDisplayName(person.profile);
  const handle = person.profile?.username;
  return (
    <View
      className="flex-row items-center gap-3 px-4"
      style={{ minHeight: 60, borderTopWidth: 1, borderTopColor: THEME.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}`}
        disabled={!handle}
        onPress={onOpen}
        className="min-w-0 flex-1 flex-row items-center gap-3"
        style={{ minHeight: 44 }}>
        <Avatar uri={person.profile?.avatar_url} name={name} size={36} />
        <View className="min-w-0 flex-1">
          <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
            {name}
          </AppText>
          {handle ? (
            <AppText className="text-[12px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
              @{handle}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${name}`}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onAction}
        className="items-center justify-center px-3"
        style={{
          minHeight: 36,
          minWidth: 80,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: busy ? THEME.surface2 : THEME.surface,
        }}>
        <AppText
          className="text-[13px] font-extrabold"
          style={{ color: busy ? THEME.textMuted : THEME.textPrimary }}>
          {busy ? '…' : actionLabel}
        </AppText>
      </Pressable>
    </View>
  );
}
