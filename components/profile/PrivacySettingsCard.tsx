import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { asCopyTone, copy, type CopyTone } from '@/lib/copy';
import { asDefaultPostAudience } from '@/lib/postAudience';
import { THEME } from '@/lib/theme';

export function PrivacySettingsCard() {
  const { profile } = useMyProfile();
  const update = useUpdateProfile();
  const postAudience = asDefaultPostAudience(profile?.default_post_audience);
  const profileVisibility = profile?.profile_visibility === 'friends' ? 'friends' : 'public';
  const encouragement = asCopyTone(profile?.encouragement_tone);

  return (
    <Card className="gap-4">
      <AppText className="text-[16px] font-extrabold text-charcoal">{copy('privacy.title')}</AppText>
      <View className="gap-2">
        <AppText className="text-[13px] font-semibold text-charcoal">
          {copy('profile.encouragementLabel')}
        </AppText>
        <SegmentedControl
          value={encouragement}
          options={[
            { value: 'gentle' as CopyTone, label: copy('profile.toneGentle') },
            { value: 'honest' as CopyTone, label: copy('profile.toneHonest') },
          ]}
          onChange={(next) => update.mutate({ encouragement_tone: next })}
          accessibilityLabel={copy('profile.encouragementLabel')}
        />
        <AppText className="text-[12px] leading-5 text-muted">
          {copy('profile.encouragementHelp')}
        </AppText>
      </View>
      <View className="gap-2">
        <AppText className="text-[13px] font-semibold text-charcoal">{copy('privacy.posts')}</AppText>
        <SegmentedControl
          value={postAudience}
          options={[
            { value: 'public', label: copy('privacy.public') },
            { value: 'friends', label: copy('privacy.friends') },
          ]}
          onChange={(next) => update.mutate({ default_post_audience: next })}
          accessibilityLabel={copy('privacy.posts')}
        />
        <AppText className="text-[12px] leading-5 text-muted">{copy('privacy.postsHelp')}</AppText>
      </View>
      <View className="gap-2">
        <AppText className="text-[13px] font-semibold text-charcoal">{copy('privacy.profile')}</AppText>
        <SegmentedControl
          value={profileVisibility}
          options={[
            { value: 'public', label: copy('privacy.public') },
            { value: 'friends', label: copy('privacy.friends') },
          ]}
          onChange={(next) => update.mutate({ profile_visibility: next })}
          accessibilityLabel={copy('privacy.profile')}
        />
      </View>
      <AppText className="text-[12px] leading-5" style={{ color: THEME.textMuted }}>
        {copy('privacy.body')}
      </AppText>
    </Card>
  );
}
