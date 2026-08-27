import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { THEME } from '@/lib/theme';
import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import type { ProfileChallenge } from '@/hooks/usePublicProfile';
import { challengeCardTags } from '@/lib/challengeTags';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { asShowcaseAudience, postAudienceFromShowcase } from '@/lib/profileShowcase';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

function placeLabel(place?: number | null) {
  if (!place || place < 1) {
    return null;
  }
  if (place === 1) {
    return '1st';
  }
  if (place === 2) {
    return '2nd';
  }
  if (place === 3) {
    return '3rd';
  }
  return `${place}th`;
}

function dateRange(start?: string | null, end?: string | null) {
  const from = start ? new Date(start) : null;
  const to = end ? new Date(end) : null;
  if (!from || Number.isNaN(from.getTime())) {
    return null;
  }
  const a = from.toLocaleDateString();
  if (!to || Number.isNaN(to.getTime())) {
    return a;
  }
  return `${a} – ${to.toLocaleDateString()}`;
}

export function ProfileChallengeRow({
  item,
  canEdit,
}: {
  item: ProfileChallenge;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const social = useSocialSheetsOptional();
  const queryClient = useQueryClient();
  const status = item.participation?.status
    ? item.participation.status === 'completed' || item.participation.completed_at
      ? 'Completed'
      : item.participation.eliminated_at
        ? 'Eliminated'
        : 'In play'
    : CHALLENGE_STATUS_LABEL[item.challenge.status] ?? item.challenge.status;
  const role = [item.hosted ? 'Hosted' : null, item.competed ? 'Competed' : null].filter(Boolean).join(' · ');
  const place = item.challenge.status === 'settled' ? placeLabel(item.placement) : null;
  const dates = dateRange(item.challenge.starts_at, item.challenge.ends_at);
  const visibility = asShowcaseAudience(
    item.competed ? item.participation?.profile_visibility : item.challenge.profile_visibility,
  );

  function openVisibility() {
    if (!canEdit) {
      return;
    }
    social?.openAudience({
      audience: postAudienceFromShowcase(visibility),
      audienceUserIds: [],
      profileOnly: true,
      onSave: async (next) => {
        const value = asShowcaseAudience(next);
        if (item.competed) {
          await supabase.rpc('set_participation_profile_visibility', {
            p_challenge_id: item.challenge.id,
            p_visibility: value,
          });
        } else {
          await supabase.rpc('set_challenge_profile_visibility', {
            p_challenge_id: item.challenge.id,
            p_visibility: value,
          });
        }
        void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      },
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        const challenge = item.challenge;
        if (!challenge?.id) {
          return;
        }
        openChallengeLobby(router, { id: challenge.id, snapshot: challenge, returnTo: 'lobby' });
      }}
      className="px-3 py-2.5"
      style={{
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: THEME.radius,
      }}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Glyph
          name={item.competed ? GLYPH.check : GLYPH.flag}
          color={THEME.accent}
          size={13}
        />
        <ChallengeTagRow tags={challengeCardTags({ challenge: item.challenge })} />
        <AppText className="text-[11px] font-semibold text-muted">{status}</AppText>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Who can see this"
            hitSlop={8}
            onPress={openVisibility}
            style={{ marginLeft: 'auto', minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.more} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
      </View>
      <AppText className="mt-1 text-[14px] font-bold text-charcoal" numberOfLines={1}>
        {item.challenge.title}
      </AppText>
      <AppText className="mt-0.5 text-[11px] text-muted">
        {[role || null, place, dates].filter(Boolean).join(' · ')}
      </AppText>
      {item.coinsWon || item.bucksWon ? (
        <View className="mt-0.5 flex-row flex-wrap items-center gap-2">
          {item.coinsWon ? (
            <StakeAmount amount={item.coinsWon} currency="coins" size={13} textClassName="text-[11px] font-semibold text-muted" />
          ) : null}
          {item.bucksWon ? (
            <StakeAmount amount={item.bucksWon} currency="bucks" size={13} textClassName="text-[11px] font-semibold text-muted" />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
