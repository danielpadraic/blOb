import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { SKILL_ATTESTATION } from '@/copy/legalDocs';
import { acceptLegal } from '@/lib/legal';
import { TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { isProfileNamed } from '@/utils/validators';
import type { Profile } from '@/lib/types';

export default function LegalAcceptScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile, refetch } = useMyProfile();
  const [tos, setTos] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [skill, setSkill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = tos && privacy && skill;

  async function submit() {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptLegal();
      const acceptedAt = new Date().toISOString();
      const patch: Partial<Profile> = {
        tos_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        skill_attestation_at: acceptedAt,
      };
      if (user?.id) {
        queryClient.setQueryData(['profile', user.id, 'self'], (current) =>
          current && typeof current === 'object' ? { ...current, ...patch } : current,
        );
      }
      const named = isProfileNamed({ ...profile, ...patch } as Profile);
      if (named) {
        router.replace(TABS_HREF);
      } else {
        router.replace('/onboarding/profile-setup' as Href);
      }
      void refetch();
    } catch (err) {
      setError(getErrorMessage(err) || 'Couldn’t save that. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-5 pb-10 pt-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AppText className="text-[22px] font-extrabold text-charcoal">Legal</AppText>
        <AppText className="mt-2 text-[14px] leading-6 text-muted">
          Read each document, then confirm. This is required before you can use blOb.
        </AppText>

        <View className="mt-6 gap-4">
          <LegalCheck
            checked={tos}
            onToggle={() => setTos((current) => !current)}
            label="I agree to the Terms of Service and User Agreement"
            linkLabel="Read the Terms of Service and User Agreement"
            onOpen={() => router.push('/onboarding/terms' as Href)}
          />
          <LegalCheck
            checked={privacy}
            onToggle={() => setPrivacy((current) => !current)}
            label="I agree to the Privacy Policy"
            linkLabel="Read the Privacy Policy"
            onOpen={() => router.push('/onboarding/privacy' as Href)}
          />
          <LegalCheck
            checked={skill}
            onToggle={() => setSkill((current) => !current)}
            label={SKILL_ATTESTATION}
          />
        </View>

        {error ? (
          <AppText className="mt-4 text-sm" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}

        <View className="mt-8">
          <Button
            title="Agree and continue"
            size="lg"
            disabled={!ready}
            loading={busy}
            onPress={() => void submit()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function LegalCheck({
  checked,
  onToggle,
  label,
  linkLabel,
  onOpen,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  linkLabel?: string;
  onOpen?: () => void;
}) {
  return (
    <View
      className="px-4 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: checked ? THEME.accent : THEME.border,
      }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 22,
            height: 22,
            marginTop: 2,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: checked ? THEME.accent : THEME.border,
            backgroundColor: checked ? THEME.accent : THEME.surface,
          }}
        />
        <AppText className="flex-1 text-[14px] leading-6 text-charcoal">{label}</AppText>
      </Pressable>
      {linkLabel && onOpen ? (
        <Pressable
          accessibilityRole="link"
          onPress={onOpen}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 34 }}>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {linkLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
