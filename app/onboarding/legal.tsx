import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalAcceptSheet, type LegalSheetId } from '@/components/legal/LegalAcceptSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { LEGAL_PRIVACY_VERSION, LEGAL_TOS_VERSION } from '@/copy/legalDocs';
import { acceptLegal } from '@/lib/legal';
import { TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { isProfileNamed } from '@/utils/validators';
import type { Profile } from '@/lib/types';

const ROWS: { id: LegalSheetId; title: string }[] = [
  { id: 'terms', title: 'Terms of Service' },
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'skill', title: 'Skill rule' },
];

export default function LegalAcceptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile, refetch } = useMyProfile();
  const [agreed, setAgreed] = useState<Record<LegalSheetId, boolean>>({
    terms: false,
    privacy: false,
    skill: false,
  });
  const [openDoc, setOpenDoc] = useState<LegalSheetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = agreed.terms && agreed.privacy && agreed.skill;

  async function submit() {
    if (!ready || busy) {
      return;
    }
    if (!user?.id) {
      setError('Sign in to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptLegal();
      const acceptedAt = new Date().toISOString();
      const patch: Partial<Profile> = {
        id: user.id,
        tos_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        skill_attestation_at: acceptedAt,
        tos_version: LEGAL_TOS_VERSION,
        privacy_version: LEGAL_PRIVACY_VERSION,
      };
      const merged = {
        ...(profile && typeof profile === 'object' ? profile : { id: user.id }),
        ...patch,
      } as Profile;
      queryClient.setQueryData(['profile', user.id, 'self'], merged);
      router.replace(isProfileNamed(merged) ? TABS_HREF : ('/onboarding/profile-setup' as Href));
      void refetch().then((result) => {
        const row = result.data && typeof result.data === 'object' ? (result.data as Profile) : merged;
        queryClient.setQueryData(['profile', user.id, 'self'], {
          ...row,
          ...patch,
        });
      });
    } catch (err) {
      setError(getErrorMessage(err) || 'Couldn’t save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-5 pb-6 pt-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AppText className="text-[22px] font-extrabold text-charcoal">Legal</AppText>
        <AppText className="mt-2 text-[14px] leading-6 text-muted">
          Read each document, then confirm. This is required before you can use blOb.
        </AppText>

        <View className="mt-6 gap-3">
          {ROWS.map((row) => (
            <LegalRow
              key={row.id}
              title={row.title}
              checked={agreed[row.id]}
              onOpen={() => {
                setError(null);
                setOpenDoc(row.id);
              }}
            />
          ))}
        </View>

        {error ? (
          <AppText className="mt-4 text-sm" style={{ color: THEME.danger }}>
            {error}
          </AppText>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1,
          borderTopColor: THEME.border,
          backgroundColor: THEME.background,
        }}>
        <Button
          title="Continue"
          size="lg"
          disabled={!ready}
          loading={busy}
          onPress={() => void submit()}
        />
      </View>

      <LegalAcceptSheet
        doc={openDoc}
        onClose={() => setOpenDoc(null)}
        onAgree={(id) => {
          setAgreed((current) => ({ ...current, [id]: true }));
          setOpenDoc(null);
        }}
      />
    </Screen>
  );
}

function LegalRow({
  title,
  checked,
  onOpen,
}: {
  title: string;
  checked: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={checked ? `${title}, agreed` : `Read ${title}`}
      onPress={onOpen}
      className="flex-row items-center px-4"
      style={{
        minHeight: 56,
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: checked ? THEME.primary : THEME.border,
        gap: 12,
      }}>
      <View
        pointerEvents="none"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? THEME.primary : THEME.border,
          backgroundColor: checked ? THEME.primary : THEME.surface,
          opacity: checked ? 1 : 0.45,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? (
          <AppText style={{ color: THEME.primaryForeground, fontSize: 12, fontWeight: '700' }}>✓</AppText>
        ) : null}
      </View>
      <AppText className="flex-1 text-[15px] font-semibold text-charcoal">{title}</AppText>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.primary }}>
        {checked ? 'Agreed' : 'Read'}
      </AppText>
    </Pressable>
  );
}
