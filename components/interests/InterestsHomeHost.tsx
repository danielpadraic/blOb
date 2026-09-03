import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { useTourOptional } from '@/components/tour/TourContext';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { interestRoomStates, useMyInterests } from '@/hooks/useInterests';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { INTEREST_PROMPT } from '@/lib/interestsCatalog';
import { interestsWeeklyNudgeDue, latestTimestamp } from '@/lib/interests';
import { persistInterestsNudgeAt, readInterestsNudgeAt } from '@/lib/interestsNudge';
import { copy } from '@/lib/copy';
import { INTERESTS_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { THEME, themeShadow } from '@/lib/theme';

export function InterestsHomeHost() {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const { mine } = useMyInterests();
  const updateProfile = useUpdateProfile();
  const router = useRouter();
  const segments = useSegments();
  const tour = useTourOptional();
  const tone = useCopyTone();
  const [busy, setBusy] = useState(false);
  const [sessionHide, setSessionHide] = useState(false);
  const [localNudge, setLocalNudge] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(!user?.id);
  const onHome = (() => {
    const parts = (segments as string[]).filter((segment) => !segment.startsWith('('));
    return parts[0] === 'feed' && (!parts[1] || parts[1] === 'index');
  })();

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLocalNudge(null);
      setLocalReady(true);
      setSessionHide(false);
      return;
    }
    setLocalReady(false);
    void readInterestsNudgeAt(user.id).then((at) => {
      if (!cancelled) {
        setLocalNudge(at);
        setLocalReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const firstTime =
    Boolean(user) && Boolean(profile) && !profile?.interests_dismissed_home_at;
  const roomsLoaded = Boolean(mine.data) && !mine.isLoading && !mine.isError;
  const weekly =
    !firstTime &&
    roomsLoaded &&
    !sessionHide &&
    interestsWeeklyNudgeDue({
      dismissedHome: profile?.interests_dismissed_home_at,
      lastNudge: latestTimestamp(profile?.interests_nudge_at, localNudge),
      states: interestRoomStates(mine.data?.rooms),
    });
  const visible = onHome && Boolean(profile) && !tour?.active && localReady && (firstTime || weekly);

  async function dismissHome(kind: 'setup' | 'skip') {
    if (!user || busy) {
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await updateProfile.mutateAsync({
        interests_dismissed_home_at: now,
        interests_skipped_all_at: kind === 'skip' ? now : profile?.interests_skipped_all_at ?? null,
        interests_prompted_at: kind === 'setup' ? now : profile?.interests_prompted_at ?? null,
      });
      if (kind === 'skip') {
        await supabase.rpc('notify_interests_skipped');
        return;
      }
      router.push(`${INTERESTS_HREF}?from=home` as typeof INTERESTS_HREF);
    } finally {
      setBusy(false);
    }
  }

  async function dismissWeekly(openWizard: boolean) {
    if (!user || busy) {
      return;
    }
    setBusy(true);
    setSessionHide(true);
    try {
      const at = await persistInterestsNudgeAt(user.id);
      setLocalNudge(at);
      if (openWizard) {
        router.push(`${INTERESTS_HREF}?from=home` as typeof INTERESTS_HREF);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <ChromeOverlay
      visible
      onClose={() => void (firstTime ? dismissHome('skip') : dismissWeekly(false))}
      align="center">
      <View
        className="mx-4 px-5 py-5"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          ...themeShadow(),
        }}>
        <View className="items-center">
          <BlobMascot variant="wave" size={120} motion="float" />
        </View>
        <AppText className="mt-4 text-center text-[22px] font-extrabold text-charcoal">
          {firstTime ? INTEREST_PROMPT.title : copy('interests.weeklyTitle', tone)}
        </AppText>
        <AppText className="mt-3 text-center text-[15px] leading-6 text-muted">
          {firstTime ? INTEREST_PROMPT.sub : copy('interests.weeklyBody', tone)}
        </AppText>
        <View className="mt-5 gap-3">
          <Button
            title={firstTime ? copy('interests.setUp', tone) : copy('interests.weeklyCta', tone)}
            size="lg"
            loading={busy}
            onPress={() => void (firstTime ? dismissHome('setup') : dismissWeekly(true))}
          />
          <Button
            title={copy('interests.skipForNow', tone)}
            variant="ghost"
            onPress={() => void (firstTime ? dismissHome('skip') : dismissWeekly(false))}
          />
        </View>
      </View>
    </ChromeOverlay>
  );
}
