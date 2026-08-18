import { Pressable, View } from 'react-native';

import { ChallengeFeedCard } from '@/components/feed/ChallengeFeedCard';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useChallengeShareState } from '@/hooks/useChallenge';
import { copy } from '@/lib/copy';
import {
  feedEventAction,
  isChallengeFeedEvent,
  personDisplayName,
  type FeedEventItem,
} from '@/lib/social';
import { THEME } from '@/lib/theme';
import { formatFeedTime } from '@/utils/format';

type FeedItemProps = {
  event: FeedEventItem;
  joined?: boolean;
  onPressChallenge?: () => void;
};

export function FeedItem({ event, joined, onPressChallenge }: FeedItemProps) {
  const name = personDisplayName(event.actor);
  const won = event.event_type === 'challenge_won';
  const challengeLinked = isChallengeFeedEvent(event);
  const share = useChallengeShareState(challengeLinked ? event.challenge_id : null);
  const note =
    typeof event.metadata?.caption === 'string'
      ? event.metadata.caption
      : typeof event.metadata?.body === 'string'
        ? event.metadata.body
        : null;

  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: won ? THEME.gold : joined ? THEME.accent : THEME.border,
        borderRadius: THEME.radius,
        padding: 14,
      }}>
      <View className="flex-row items-start">
        <ProfileLink username={event.actor?.username} userId={event.actor_id}>
          <Avatar uri={event.actor?.avatar_url} name={name} size={40} />
        </ProfileLink>
        <View className="ml-3 min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <ProfileLink username={event.actor?.username} userId={event.actor_id}>
                <AppText className="text-[15px] font-bold text-charcoal" numberOfLines={1}>
                  {name}
                </AppText>
              </ProfileLink>
              <AppText
                className="text-[13px] leading-4"
                style={{ color: won ? THEME.gold : THEME.textMuted }}
                numberOfLines={2}>
                {feedEventAction(event)}
              </AppText>
            </View>
            <AppText className="text-[11px] text-muted">{formatFeedTime(event.created_at)}</AppText>
          </View>
          {note ? (
            <AppText className="mt-1.5 text-[14px] leading-5 text-charcoal" numberOfLines={3}>
              {note}
            </AppText>
          ) : null}
          {event.challenge ? (
            <ChallengeFeedCard
              challenge={event.challenge}
              joined={joined}
              won={won}
              onPress={onPressChallenge}
            />
          ) : share.data?.reason === 'geo' ? (
            <AppText className="mt-2 text-[12px]" style={{ color: THEME.textMuted }}>
              {copy('geo.unavailable')}
            </AppText>
          ) : null}
          <View className="mt-3 flex-row items-center gap-4">
            <View className="flex-row items-center gap-1.5 opacity-50">
              <Glyph name={GLYPH.likeOutline} color={THEME.textMuted} size={16} />
              <AppText className="text-[12px] font-semibold text-muted">React</AppText>
            </View>
            <View className="flex-row items-center gap-1.5 opacity-50">
              <Glyph name={GLYPH.reply} color={THEME.textMuted} size={16} />
              <AppText className="text-[12px] font-semibold text-muted">Comment</AppText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
