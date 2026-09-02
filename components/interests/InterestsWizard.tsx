import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackdropSlot } from '@/components/interests/BackdropSlot';
import { ChipFollowUpCard } from '@/components/interests/ChipFollowUp';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useInterestCatalog, useMyInterests, useSaveInterestRoom } from '@/hooks/useInterests';
import { continueBlocked, setChipMark, toggleChipStance, type ChipStance } from '@/lib/interests';
import {
  dropFollowUp,
  ensureFollowUp,
  followUpFromRow,
  isQtyKind,
  isRatingKind,
  pruneFollowUps,
  type ChipFollowUp,
} from '@/lib/interestsFollowup';
import {
  INTEREST_PROMPT,
  INTEREST_ROOM_SLUGS,
  chipDef,
  nextRoomSlug,
  roomDef,
  type InterestChipDef,
  type InterestRoomSlug,
} from '@/lib/interestsCatalog';
import { copy, type CopyTone } from '@/lib/copy';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

type WizardStep = 'prompt' | InterestRoomSlug;

export function InterestsWizard({
  fromHome = false,
  tone = 'gentle',
}: {
  fromHome?: boolean;
  tone?: CopyTone;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOverlap() > 0;
  const { profile } = useMyProfile();
  const catalog = useInterestCatalog();
  const { mine } = useMyInterests();
  const saveRoom = useSaveInterestRoom();
  const updateProfile = useUpdateProfile();
  const prompted = Boolean(profile?.interests_prompted_at);
  const [step, setStep] = useState<WizardStep>(prompted ? INTEREST_ROOM_SLUGS[0] : 'prompt');
  const [stances, setStances] = useState<Record<string, ChipStance>>({});
  const [followUps, setFollowUps] = useState<Record<string, ChipFollowUp>>({});
  const [otherText, setOtherText] = useState('');
  const [occupation, setOccupation] = useState('');
  const [employer, setEmployer] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [hydratedRoom, setHydratedRoom] = useState<string | null>(null);

  const room = step === 'prompt' ? null : roomDef(step);
  const catalogChips = (catalog.data ?? []).filter((row) => row.room_slug === step);
  const chips: InterestChipDef[] =
    catalogChips.length > 0
      ? catalogChips.map((row) => {
          const local = step === 'prompt' ? null : chipDef(step, row.slug);
          return {
            slug: row.slug,
            label: row.label,
            allowsIndoorOutdoor: row.allows_indoor_outdoor,
            ratingKind: isRatingKind(row.rating_kind) ? row.rating_kind : (local?.ratingKind ?? null),
            qtyKind: isQtyKind(row.qty_kind) ? row.qty_kind : (local?.qtyKind ?? null),
            isWork: row.slug === 'work',
            isOther: row.slug === 'other',
          };
        })
      : [...(room?.chips ?? [])];

  useEffect(() => {
    if (step === 'prompt' || !mine.data || hydratedRoom === step) {
      return;
    }
    const next: Record<string, ChipStance> = {};
    const nextFollow: Record<string, ChipFollowUp> = {};
    for (const row of mine.data.chips) {
      if (row.catalog?.room_slug !== step) {
        continue;
      }
      next[row.catalog.slug] = { excel: row.excel, levelUp: row.level_up };
      nextFollow[row.catalog.slug] = followUpFromRow(row);
    }
    setStances(next);
    setFollowUps(nextFollow);
    setOtherText(mine.data.other.find((item) => item.room_slug === step)?.raw_text ?? '');
    setOccupation(mine.data.work?.occupation ?? '');
    setEmployer(mine.data.work?.employer ?? '');
    setHydratedRoom(step);
    setFormError(null);
  }, [hydratedRoom, mine.data, step]);

  function onChipPress(slug: string) {
    setStances((current) => {
      const next = toggleChipStance(current, slug);
      setFollowUps((follow) =>
        next[slug] ? ensureFollowUp(follow, slug) : dropFollowUp(follow, slug),
      );
      return next;
    });
  }

  const workOn = chips.some((chip) => chip.isWork && stances[chip.slug]);
  const otherOn = chips.some((chip) => chip.isOther && stances[chip.slug]);
  const selectedChips = chips.filter((chip) => stances[chip.slug]);

  function leave() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/profile');
  }

  async function markPrompted() {
    if (!profile?.interests_prompted_at) {
      await updateProfile.mutateAsync({
        interests_prompted_at: new Date().toISOString(),
        interests_dismissed_home_at: profile?.interests_dismissed_home_at ?? new Date().toISOString(),
      });
    }
  }

  async function goNext(from: InterestRoomSlug) {
    const next = nextRoomSlug(from);
    if (next) {
      setHydratedRoom(null);
      setStep(next);
      return;
    }
    leave();
  }

  async function onContinue() {
    if (step === 'prompt') {
      await markPrompted();
      setStep(INTEREST_ROOM_SLUGS[0]);
      return;
    }
    const blocked = continueBlocked({
      stances,
      workOn,
      occupation,
      employer,
      otherOn,
      otherText,
    });
    if (blocked) {
      setFormError(blocked);
      return;
    }
    setFormError(null);
    try {
      await saveRoom.mutateAsync({
        room: step,
        action: 'save',
        stances,
        followUps: pruneFollowUps(followUps, stances),
        otherText,
        occupation,
        employer,
      });
      await markPrompted();
      await goNext(step);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : copy('error.preferenceSave', tone));
    }
  }

  async function onNone() {
    if (step === 'prompt') {
      return;
    }
    setFormError(null);
    try {
      await saveRoom.mutateAsync({ room: step, action: 'none', stances: {} });
      await markPrompted();
      await goNext(step);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : copy('error.preferenceSave', tone));
    }
  }

  async function onSkip() {
    if (step === 'prompt') {
      leave();
      return;
    }
    setFormError(null);
    try {
      await saveRoom.mutateAsync({ room: step, action: 'skip', stances });
      await markPrompted();
      await goNext(step);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : copy('error.preferenceSave', tone));
    }
  }

  const title = step === 'prompt' ? INTEREST_PROMPT.title : room?.title ?? '';
  const sub = step === 'prompt' ? INTEREST_PROMPT.sub : room?.sub ?? '';
  const footerPad = createStickyFooterPad(keyboardOpen, tabBarLift(insets.bottom, 'sticky') + 8);
  const roomIndex = step === 'prompt' ? 0 : INTEREST_ROOM_SLUGS.indexOf(step) + 1;

  return (
    <BackdropSlot roomSlug={step === 'prompt' ? 'health_fitness' : step} playing>
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 48,
            paddingBottom: 24,
            gap: 12,
          }}
          keyboardShouldPersistTaps="handled">
          <AppText className="text-[12px] font-semibold" style={{ color: THEME.accentBright }}>
            {step === 'prompt'
              ? copy('interests.promptKicker', tone)
              : `${roomIndex} / ${INTEREST_ROOM_SLUGS.length}`}
          </AppText>
          <AppText
            className="text-[26px] font-extrabold"
            style={{ color: THEME.primaryForeground, lineHeight: 32 }}>
            {title}
          </AppText>
          <AppText className="text-[15px] leading-5" style={{ color: THEME.accentBright }}>
            {sub}
          </AppText>

          {step !== 'prompt' ? (
            <ChipRow>
              {chips.map((chip) => {
                const stance = stances[chip.slug];
                return (
                  <View key={chip.slug} style={{ width: '31%', maxWidth: '31%' }}>
                    <Chip
                      label={chip.label}
                      selected={Boolean(stance)}
                      excel={stance?.excel}
                      levelUp={stance?.levelUp}
                      onPress={() => onChipPress(chip.slug)}
                      onToggleExcel={() => setStances((current) => setChipMark(current, chip.slug, 'excel'))}
                      onToggleLevelUp={() =>
                        setStances((current) => setChipMark(current, chip.slug, 'levelUp'))
                      }
                    />
                  </View>
                );
              })}
            </ChipRow>
          ) : null}

          {selectedChips.map((chip) => (
            <ChipFollowUpCard
              key={`follow-${chip.slug}`}
              chip={chip}
              followUp={followUps[chip.slug] ?? followUpFromRow({})}
              onChange={(next) => setFollowUps((current) => ({ ...current, [chip.slug]: next }))}
            />
          ))}

          {workOn ? (
            <View
              className="gap-3 p-4"
              style={{
                backgroundColor: THEME.surface,
                borderRadius: THEME.radius,
                ...themeShadow(),
              }}>
              <Input
                label={copy('interests.occupation')}
                value={occupation}
                onChangeText={setOccupation}
                autoCapitalize="words"
              />
              <Input
                label={copy('interests.employer')}
                value={employer}
                onChangeText={setEmployer}
                autoCapitalize="words"
              />
            </View>
          ) : null}

          {otherOn ? (
            <View
              className="p-4"
              style={{
                backgroundColor: THEME.surface,
                borderRadius: THEME.radius,
                ...themeShadow(),
              }}>
              <Input label={copy('interests.other')} value={otherText} onChangeText={setOtherText} grow />
            </View>
          ) : null}

          {formError ? (
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
              {formError}
            </AppText>
          ) : null}
        </ScrollView>

        <View
          className="gap-2 px-4 pt-2"
          style={{
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: footerPad,
            ...themeShadow('bar'),
          }}>
          {step === 'prompt' ? (
            <>
              <Button
                title={copy('interests.continue', tone)}
                size="lg"
                onPress={() => void onContinue()}
                loading={saveRoom.isPending || updateProfile.isPending}
              />
              <Button
                title={fromHome ? copy('interests.skipForNow', tone) : copy('interests.skip', tone)}
                variant="ghost"
                onPress={leave}
              />
            </>
          ) : (
            <>
              <Button
                title={copy('interests.continue', tone)}
                size="lg"
                onPress={() => void onContinue()}
                loading={saveRoom.isPending}
              />
              <View className="flex-row gap-2">
                <View style={{ flex: 1 }}>
                  <Button title={copy('interests.none', tone)} variant="outline" onPress={() => void onNone()} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={copy('interests.skip', tone)} variant="ghost" onPress={() => void onSkip()} />
                </View>
              </View>
            </>
          )}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={leave}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
        }}>
        <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
          {copy('interests.close')}
        </AppText>
      </Pressable>
    </BackdropSlot>
  );
}
