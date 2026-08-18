import { View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { personDisplayName, type PeopleRelation } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';

type UserSearchResultProps = {
  profile: PublicProfile;
  relation: PeopleRelation;
  busy?: boolean;
  onPrimary: () => void;
};

const ACTION: Record<
  Exclude<PeopleRelation, 'self'>,
  { title: string; variant: 'primary' | 'secondary' | 'outline' | 'mint' | 'ghost' }
> = {
  none: { title: 'Follow', variant: 'secondary' },
  following: { title: 'Add friend', variant: 'primary' },
  requested: { title: 'Requested', variant: 'outline' },
  incoming: { title: 'Accept', variant: 'primary' },
  friends: { title: 'Friends', variant: 'mint' },
};

export function UserSearchResult({ profile, relation, busy, onPrimary }: UserSearchResultProps) {
  const name = personDisplayName(profile);
  const tags = profile.skill_tags?.slice(0, 2) ?? [];
  const action = relation === 'self' ? null : ACTION[relation];

  return (
    <Card>
      <View className="flex-row items-center">
        <ProfileLink username={profile.username} userId={profile.id}>
          <Avatar uri={profile.avatar_url} name={name} size={44} />
        </ProfileLink>
        <View className="ml-3 min-w-0 flex-1">
          <ProfileLink username={profile.username} userId={profile.id}>
            <AppText className="text-[15px] font-bold text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
          </ProfileLink>
          <AppText className="text-[12px] text-muted" numberOfLines={1}>
            @{profile.username}
            {tags.length > 0 ? ` · ${tags.join(', ')}` : ''}
          </AppText>
          <AppText className="mt-0.5 text-[11px] font-semibold" style={{ color: THEME.accent }}>
            {statusLabel(relation)}
          </AppText>
        </View>
        {action ? (
          <Button
            title={action.title}
            size="sm"
            variant={action.variant}
            loading={busy}
            onPress={onPrimary}
          />
        ) : null}
      </View>
    </Card>
  );
}

function statusLabel(relation: PeopleRelation) {
  switch (relation) {
    case 'friends':
      return 'Friends';
    case 'incoming':
      return 'Sent you a request';
    case 'requested':
      return 'Request sent';
    case 'following':
      return 'Following';
    case 'self':
      return 'That’s you';
    default:
      return 'Not following yet';
  }
}
