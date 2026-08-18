import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useCreateChallengeInvite, usePendingChallengeInvites } from '@/hooks/useChallengeInvites';
import { inviteLinkForToken } from '@/lib/challengeInvites';
import type { ChallengeInviteWithInvitee } from '@/lib/types';
import { formatRelative } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';

type ChallengeInvitesCardProps = {
  challengeId: string;
  onInvitePerson: () => void;
};

function inviteLabel(row: ChallengeInviteWithInvitee): string {
  if (row.invitee?.username) {
    return `@${row.invitee.username}`;
  }
  if (row.invitee_id) {
    return row.invitee?.display_name?.trim() || 'Invited blob';
  }
  return 'Invite link';
}

export function ChallengeInvitesCard({ challengeId, onInvitePerson }: ChallengeInvitesCardProps) {
  const pending = usePendingChallengeInvites(challengeId);
  const createInvite = useCreateChallengeInvite(challengeId);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      const result = await createInvite.mutateAsync();
      const url = inviteLinkForToken(result.token);
      await Clipboard.setStringAsync(url);
      setCopied(true);
      Alert.alert('Invite link copied', 'Send it to someone you trust. They’ll open it in blOb.');
    } catch (error) {
      Alert.alert('Couldn’t copy invite', getErrorMessage(error));
    }
  }

  const rows = pending.data ?? [];

  return (
    <Card className="mt-4 gap-3">
      <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        Invites
      </AppText>
      <AppText className="text-sm leading-5 text-muted">
        This challenge is private. People need a link or a username invite to join.
      </AppText>
      <Button
        title={copied ? 'Copy another link' : 'Copy invite link'}
        size="lg"
        loading={createInvite.isPending}
        onPress={() => void copyLink()}
      />
      <Button title="Invite by username" variant="outline" onPress={onInvitePerson} />
      {pending.isError ? (
        <AppText className="text-sm leading-5 text-muted">
          Couldn’t load pending invites. Pull to refresh.
        </AppText>
      ) : rows.length === 0 ? (
        <AppText className="text-sm leading-5 text-muted">No pending invites yet.</AppText>
      ) : (
        <View className="gap-2">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Pending
          </AppText>
          {rows.map((row) => (
            <View key={row.id} className="flex-row items-center justify-between gap-3">
              <AppText className="flex-1 font-semibold text-charcoal" numberOfLines={1}>
                {inviteLabel(row)}
              </AppText>
              <AppText className="text-[12px] text-muted">{formatRelative(row.created_at)}</AppText>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
