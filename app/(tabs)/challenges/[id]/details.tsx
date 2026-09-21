import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengePhotoField } from '@/components/challenge/create/ChallengePhotoField';
import { HeartRateMinutesRow } from '@/components/challenge/create/ExtraTasksEditor';
import { LocationPlacePicker } from '@/components/challenge/LocationPlacePicker';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { KeyboardField, KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useStalled } from '@/hooks/useStalled';
import { useChallenge, useUpdateOfficialChallengeDetails } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import {
  addSimpleProof,
  removeSimpleProof,
  SIMPLE_PROOF_METHODS,
} from '@/lib/simpleChallenge';
import {
  SIMPLE_PROOF_CAP,
  ensureProofSentence,
  firstProofMethod,
  proofNameForMethodChange,
  proofRequirementsFrom,
  proofTypeFromMethod,
  type ChallengeProof,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { keepDetailsDraft, type DetailsDraft } from '@/lib/detailsDraft';
import { persistChallengePlaces } from '@/lib/locationPlaces';
import { descriptionGrowMaxLines } from '@/lib/composerField';
import { copy } from '@/lib/copy';
import { canEditOfficialDetails } from '@/lib/officialScoring';
import { supabase } from '@/lib/supabase';
import { tabBarLift, THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

const DETAILS_SOURCE_SELECT =
  'title, description, cover_image_url, rules, proofs, proof_type, proof_requirements, sponsor_name, privacy_mode, is_official, created_by, status, min_minutes';

function detailsSaveMessage(error: unknown): string {
  const raw = getErrorMessage(error).toLowerCase();
  const joined = `${error instanceof Error ? error.message : ''} ${raw}`.toLowerCase();
  if (joined.includes('title_required')) {
    return 'Give the challenge a title.';
  }
  if (joined.includes('invalid_proofs')) {
    return 'Add at least one proof.';
  }
  if (joined.includes('forbidden')) {
    return 'You can’t edit these details.';
  }
  return copy('error.saveDetails');
}

export default function OfficialDetailsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const challengeQuery = useChallenge(id);
  const save = useUpdateOfficialChallengeDetails(id);
  const [draft, setDraft] = useState<DetailsDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const userTouchedRef = useRef(false);
  const seededKeyRef = useRef<string | null>(null);

  const detailsSource = useQuery({
    queryKey: ['official-details-source', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select(DETAILS_SOURCE_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },
  });

  const challenge = challengeQuery.data;
  const merged = detailsSource.data ? { ...challenge, ...detailsSource.data } : challenge;
  const queryReady =
    !challengeQuery.isPending && (detailsSource.isFetched || detailsSource.isError);
  const allowed = canEditOfficialDetails({
    challenge: merged,
    viewerId: user?.id,
    profile,
  });
  // A deleted or unreadable challenge settles the queries without ever producing a row, which used
  // to leave this screen on "Loading details…" for good.
  const stalled = useStalled(!queryReady || !draft);
  const unreadable = queryReady && !merged;

  useEffect(() => {
    if (seededKeyRef.current && seededKeyRef.current !== id) {
      userTouchedRef.current = false;
      seededKeyRef.current = null;
      setDraft(null);
    }
  }, [id]);

  useEffect(() => {
    if (!queryReady || !merged || !id) {
      return;
    }
    if (userTouchedRef.current) {
      return;
    }
    if (seededKeyRef.current === id) {
      return;
    }
    seededKeyRef.current = id;
    setDraft((current) => keepDetailsDraft(current, merged, userTouchedRef.current));
  }, [id, merged, queryReady]);

  function patch(next: Partial<DetailsDraft>) {
    userTouchedRef.current = true;
    setDraft((current) => (current ? { ...current, ...next } : current));
    setFormError(null);
  }

  function onSave() {
    if (!draft) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      setFormError('Give the challenge a title.');
      return;
    }
    const proofs = draft.proofs
      .map((proof) =>
        ensureProofSentence(
          { ...proof, name: proof.name.trim() },
          proof.method === 'hr' ? Math.max(proof.minutes || 30, 1) : 30,
        ),
      )
      .filter((proof) => proof.name.trim());
    if (proofs.length < 1) {
      setFormError('Add at least one proof.');
      return;
    }
    setFormError(null);
    save.mutate(
      {
        title,
        description: draft.description.trim() || null,
        cover_image_url: draft.cover_image_url.trim() || null,
        rules: draft.rules.trim() || null,
        sponsor_name: draft.sponsor_name.trim() || null,
        proofs,
        proof_requirements: proofRequirementsFrom(proofs),
        proof_type: proofTypeFromMethod(firstProofMethod(proofs)),
      },
      {
        onSuccess: () => {
          void (id ? persistChallengePlaces(id, proofs) : Promise.resolve()).finally(() => router.back());
        },
        onError: (error) => {
          setFormError(detailsSaveMessage(error));
        },
      },
    );
  }

  if (unreadable || stalled) {
    return (
      <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <MascotState
          kind="error"
          title={unreadable ? copy('challenge.unavailable') : 'Something went wrong'}
          body={
            unreadable
              ? 'This challenge is gone or you no longer have access to it.'
              : 'We couldn’t load these details. Try again in a moment.'
          }
          actionLabel="Retry"
          onAction={() => {
            void challengeQuery.refetch();
            void detailsSource.refetch();
          }}
        />
      </View>
    );
  }

  if (!queryReady || !draft) {
    return (
      <View className="flex-1 px-4 pt-6" style={{ backgroundColor: THEME.background }}>
        <AppText className="text-sm leading-5 text-muted">Loading details…</AppText>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View className="flex-1 px-4 pt-6" style={{ backgroundColor: THEME.background }}>
        <AppText className="text-sm leading-5 text-muted">
          Only the host or Official can edit these details.
        </AppText>
      </View>
    );
  }

  const descriptionLines = descriptionGrowMaxLines(Dimensions.get('window').height);

  return (
    <KeyboardFormShell
      padded
      protectFieldFocus
      closedFooterPad={tabBarLift(insets.bottom, 'sticky')}
      footer={
        <View className="gap-2">
          {formError ? (
            <AppText className="text-sm leading-5 text-coral-dark">{formError}</AppText>
          ) : null}
          <Button title={copy('create.save')} loading={save.isPending} onPress={onSave} />
        </View>
      }>
        <View style={{ gap: 16, paddingTop: 12 }}>
        <AppText className="text-[13px] leading-5 text-muted">
          Title, photo, rules, and proofs. Scoring and privacy stay as they are.
        </AppText>

        <KeyboardField>
          <Input
            name="challenge-title"
            label={copy('create.titleLabel')}
            placeholder={copy('create.titlePlaceholder')}
            value={draft.title}
            onChangeText={(title) => patch({ title })}
            onFocus={() => {
              userTouchedRef.current = true;
            }}
            maxLength={80}
          />
        </KeyboardField>
        <KeyboardField>
          <Input
            name="challenge-description"
            label={copy('create.descriptionLabel')}
            placeholder={copy('create.descriptionPlaceholder')}
            value={draft.description}
            onChangeText={(description) => patch({ description })}
            onFocus={() => {
              userTouchedRef.current = true;
            }}
            grow
            growMaxLines={descriptionLines}
            maxLength={2000}
          />
        </KeyboardField>
        <ChallengePhotoField
          uri={draft.cover_image_url}
          onChange={(cover_image_url) => patch({ cover_image_url })}
          onClear={() => patch({ cover_image_url: '' })}
        />
        <KeyboardField>
          <Input
            name="challenge-sponsor"
            label={copy('create.sponsorLabel')}
            placeholder={copy('create.sponsorPlaceholder')}
            value={draft.sponsor_name}
            onChangeText={(sponsor_name) => patch({ sponsor_name })}
            maxLength={80}
          />
        </KeyboardField>
        <KeyboardField>
          <Input
            name="challenge-rules"
            label={copy('create.rulesLabel')}
            placeholder={copy('create.rulesPlaceholder')}
            value={draft.rules}
            onChangeText={(rules) => patch({ rules })}
            grow
            growMaxLines={descriptionGrowMaxLines(Dimensions.get('window').height)}
            maxLength={8000}
          />
        </KeyboardField>

        <View className="gap-2">
          <AppText className="text-[13px] font-semibold text-charcoal">{copy('create.proofs')}</AppText>
          <View className="gap-3">
            {draft.proofs.map((proof) => (
              <View key={proof.id} className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <KeyboardField>
                      <Input
                        name={`challenge-proof-${proof.id}`}
                        placeholder={copy('create.proofFallback')}
                        value={proof.name}
                        onChangeText={(name) =>
                          patch({
                            proofs: draft.proofs.map((item) =>
                              item.id === proof.id ? { ...item, name } : item,
                            ),
                          })
                        }
                        grow
                        maxLength={120}
                      />
                    </KeyboardField>
                  </View>
                  {draft.proofs.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove proof"
                      onPress={() => patch({ proofs: removeSimpleProof(draft.proofs, proof.id) })}
                      className="h-[52px] w-[52px] items-center justify-center rounded-xl"
                      style={{ borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface }}>
                      <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                    </Pressable>
                  ) : null}
                </View>
                <ChipRow>
                  {SIMPLE_PROOF_METHODS.map((item) => (
                    <Chip
                      key={item.value}
                      label={item.label}
                      minHeight={44}
                      selected={proof.method === item.value}
                      onPress={() =>
                        patch({
                          proofs: draft.proofs.map((row) =>
                            row.id === proof.id
                              ? ensureProofSentence(
                                  {
                                    ...row,
                                    method: item.value as ChallengeProofMethod,
                                    minutes:
                                      item.value === 'hr' ? Math.max(row.minutes || 30, 1) : row.minutes,
                                    name: proofNameForMethodChange(
                                      row,
                                      item.value as ChallengeProofMethod,
                                      item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                                    ),
                                  },
                                  item.value === 'hr' ? Math.max(row.minutes || 30, 1) : 30,
                                )
                              : row,
                          ),
                        })
                      }
                    />
                  ))}
                </ChipRow>
                {proof.method === 'hr' ? (
                  <HeartRateMinutesRow
                    value={proof.minutes || 30}
                    onChange={(minutes) =>
                      patch({
                        proofs: draft.proofs.map((row) =>
                          row.id === proof.id
                            ? ensureProofSentence({ ...row, method: 'hr', minutes }, minutes)
                            : row,
                        ),
                      })
                    }
                  />
                ) : null}
                {proof.method === 'location' ? (
                  <LocationPlacePicker
                    place={proof.place}
                    onChange={(place) =>
                      patch({
                        proofs: draft.proofs.map((row) =>
                          row.id === proof.id ? ensureProofSentence({ ...row, method: 'location', place }) : row,
                        ),
                      })
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
          {draft.proofs.length < SIMPLE_PROOF_CAP ? (
            <Chip
              label={copy('create.addProof')}
              selected={false}
              onPress={() => patch({ proofs: addSimpleProof(draft.proofs) })}
            />
          ) : null}
          <AppText className="text-[12px] text-muted">{copy('create.proofsHelper')}</AppText>
        </View>
        </View>
    </KeyboardFormShell>
  );
}
