import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCard } from '@/components/interests/ActivityCard';
import { ActivityCardPager, type ActivityCardPagerHandle } from '@/components/interests/ActivityCardPager';
import { BackdropSlot } from '@/components/interests/BackdropSlot';
import { InterestsStartThisSheet } from '@/components/interests/InterestsStartThisSheet';
import { RoomSlide } from '@/components/interests/RoomSlide';
import { useReduceMotion } from '@/components/interests/useReduceMotion';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useDismissStartThis, useInterestCatalog, useMyInterests, useSaveInterestRoom } from '@/hooks/useInterests';
import {
  roomContinueBlocked,
  stanceFromMarks,
  stanceMarks,
  toggleRoomPickerChip,
  type ChipStance,
} from '@/lib/interests';
import {
  activityCardBlocked,
  dropFollowUp,
  emptyFollowUp,
  followUpFromRow,
  isQtyKind,
  isRatingKind,
  pruneFollowUps,
  type ChipFollowUp,
} from '@/lib/interestsFollowup';
import {
  INTEREST_PROMPT,
  INTEREST_ROOM_SLUGS,
  NONE_CHIP_SLUG,
  chipDef,
  defaultQtyPeriod,
  nextRoomSlug,
  roomDef,
  type InterestChipDef,
  type InterestRoomSlug,
} from '@/lib/interestsCatalog';
import { preferredUnitSystem } from '@/lib/bodyMetrics';
import { copy, type CopyTone } from '@/lib/copy';
import {
  pickStartThisStarter,
  shouldOfferStartThis,
  startThisHref,
} from '@/lib/interestsMatch';
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
  const dismissStartThis = useDismissStartThis();
  const updateProfile = useUpdateProfile();
  const prompted = Boolean(profile?.interests_prompted_at);
  const [step, setStep] = useState<WizardStep>(prompted ? INTEREST_ROOM_SLUGS[0] : 'prompt');
  const [cardIndex, setCardIndex] = useState<number | null>(null);
  const [stances, setStances] = useState<Record<string, ChipStance>>({});
  const [noneOfThese, setNoneOfThese] = useState(false);
  const [followUps, setFollowUps] = useState<Record<string, ChipFollowUp>>({});
  const [otherText, setOtherText] = useState('');
  const [occupation, setOccupation] = useState('');
  const [employer, setEmployer] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [hydratedRoom, setHydratedRoom] = useState<string | null>(null);
  const [sliding, setSliding] = useState(false);
  const [roomDir, setRoomDir] = useState<1 | -1>(1);
  const [bobCheck, setBobCheck] = useState(false);
  const [startThis, setStartThis] = useState<{
    room: InterestRoomSlug;
    chipLabel: string;
    href: ReturnType<typeof startThisHref>;
  } | null>(null);
  const pagerRef = useRef<ActivityCardPagerHandle>(null);
  const bobTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReduceMotion();
  const units = preferredUnitSystem(profile);

  const room = step === 'prompt' ? null : roomDef(step);
  const catalogChips = (catalog.data ?? []).filter((row) => row.room_slug === step);
  const chips: InterestChipDef[] =
    catalogChips.length > 0
      ? catalogChips.map((row) => {
          const local = step === 'prompt' ? null : chipDef(step, row.slug);
          return {
            slug: row.slug,
            label: local?.label ?? row.label,
            allowsIndoorOutdoor: false,
            ratingKind: isRatingKind(row.rating_kind) ? row.rating_kind : (local?.ratingKind ?? null),
            qtyKind: local?.qtyKind ?? (isQtyKind(row.qty_kind) ? row.qty_kind : null),
            defaultPeriod: local?.defaultPeriod,
            isWork: row.slug === 'work',
            isOther: row.slug === 'other',
          };
        })
      : [...(room?.chips ?? [])];

  const selectedChips = chips.filter((chip) => stances[chip.slug]);
  const cardChip = cardIndex != null ? selectedChips[cardIndex] : null;
  const onCard = Boolean(cardChip && step !== 'prompt');

  useEffect(() => {
    return () => {
      if (bobTimer.current) {
        clearTimeout(bobTimer.current);
      }
    };
  }, []);

  function flashBobCheck() {
    setBobCheck(true);
    if (bobTimer.current) {
      clearTimeout(bobTimer.current);
    }
    bobTimer.current = setTimeout(() => setBobCheck(false), 800);
  }

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
      const score = stanceFromMarks(row.excel, row.level_up, row.stance_score == null ? null : Number(row.stance_score));
      next[row.catalog.slug] = stanceMarks(score);
      nextFollow[row.catalog.slug] = followUpFromRow(row);
    }
    const roomRow = mine.data.rooms.find((item) => item.room_slug === step);
    setStances(next);
    setFollowUps(nextFollow);
    setNoneOfThese(roomRow?.state === 'complete_empty' && Object.keys(next).length === 0);
    setOtherText(mine.data.other.find((item) => item.room_slug === step)?.raw_text ?? '');
    setOccupation(mine.data.work?.occupation ?? '');
    setEmployer(mine.data.work?.employer ?? '');
    setHydratedRoom(step);
    setCardIndex(null);
    setFormError(null);
  }, [hydratedRoom, mine.data, step]);

  function onChipPress(slug: string) {
    const next = toggleRoomPickerChip({ selected: stances, noneOfThese }, slug);
    setStances(next.selected);
    setNoneOfThese(next.noneOfThese);
    setFollowUps((follow) => {
      if (slug === NONE_CHIP_SLUG) {
        return {};
      }
      return next.selected[slug]
        ? {
            ...follow,
            [slug]:
              follow[slug] ??
              emptyFollowUp(defaultQtyPeriod(chips.find((chip) => chip.slug === slug) ?? chips[0])),
          }
        : dropFollowUp(follow, slug);
    });
    setFormError(null);
  }

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
    setCardIndex(null);
    if (next) {
      setRoomDir(1);
      flashBobCheck();
      setHydratedRoom(null);
      setStep(next);
      return;
    }
    leave();
  }

  async function onContinue() {
    if (step === 'prompt') {
      await markPrompted();
      setRoomDir(1);
      flashBobCheck();
      setStep(INTEREST_ROOM_SLUGS[0]);
      return;
    }
    if (catalogChips.length === 0) {
      setFormError('Couldn’t load this room. Try again.');
      return;
    }
    const blocked = roomContinueBlocked({ selected: stances, noneOfThese });
    if (blocked) {
      setFormError(blocked);
      return;
    }
    setFormError(null);
    try {
      if (noneOfThese) {
        await saveRoom.mutateAsync({ room: step, action: 'none', stances: {} });
        await markPrompted();
        await goNext(step);
        return;
      }
      await saveRoom.mutateAsync({
        room: step,
        action: 'select',
        stances,
        followUps: pruneFollowUps(followUps, stances),
      });
      await markPrompted();
      setCardIndex(0);
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

  async function onCardNext() {
    if (step === 'prompt' || !cardChip || sliding) {
      return;
    }
    const followUp = followUps[cardChip.slug] ?? emptyFollowUp(defaultQtyPeriod(cardChip));
    const blocked = activityCardBlocked({
      chip: cardChip,
      followUp,
      room: step,
      occupation,
      employer,
      otherText,
    });
    if (blocked) {
      setFormError(blocked);
      return;
    }
    setFormError(null);
    const last = cardIndex === selectedChips.length - 1;
    const existingRoom = (mine.data?.rooms ?? []).find((row) => row.room_slug === step);
    const wasAlreadyFilled = existingRoom?.state === 'complete_filled';
    try {
      await saveRoom.mutateAsync({
        room: step,
        action: 'card',
        stances,
        followUps: pruneFollowUps({ ...followUps, [cardChip.slug]: followUp }, stances),
        chipSlug: cardChip.slug,
        completeRoom: last,
        otherText,
        occupation,
        employer,
      });
      if (last) {
        const picked = shouldOfferStartThis({
          wasAlreadyFilled,
          dismissedAt: existingRoom?.start_this_dismissed_at,
          completeFilled: true,
        })
          ? pickStartThisStarter(
              selectedChips.map((chip) => ({
                slug: chip.slug,
                label: chip.label,
                room: step,
                stanceScore: (followUps[chip.slug] ?? emptyFollowUp(defaultQtyPeriod(chip))).stanceScore,
              })),
            )
          : null;
        if (picked) {
          setStartThis({
            room: step,
            chipLabel: picked.chipLabel,
            href: startThisHref(picked.starter),
          });
          return;
        }
        setSliding(true);
        setRoomDir(1);
        flashBobCheck();
        setHydratedRoom(null);
        const next = nextRoomSlug(step);
        setCardIndex(null);
        if (next) {
          setStep(next);
          setSliding(false);
          return;
        }
        setSliding(false);
        leave();
        return;
      }
      setCardIndex((current) => (current == null ? 0 : current + 1));
    } catch (error) {
      setSliding(false);
      setFormError(error instanceof Error ? error.message : copy('error.preferenceSave', tone));
    }
  }

  async function onCardBack() {
    if (sliding || cardIndex == null) {
      return;
    }
    if (cardIndex > 0) {
      setFormError(null);
      setCardIndex(cardIndex - 1);
      return;
    }
    setSliding(true);
    await pagerRef.current?.exit('right');
    setSliding(false);
    setCardIndex(null);
  }

  async function finishStartThis(goCreate: boolean) {
    if (!startThis) {
      return;
    }
    const from = startThis.room;
    const href = startThis.href;
    try {
      await dismissStartThis.mutateAsync(from);
    } catch {
      // Cap is best-effort. Still leave the sheet so it cannot loop.
    }
    setStartThis(null);
    if (goCreate) {
      router.push(href);
      return;
    }
    await goNext(from);
  }

  const title = step === 'prompt' ? INTEREST_PROMPT.title : room?.title ?? '';
  const sub = step === 'prompt' ? INTEREST_PROMPT.sub : room?.sub ?? '';
  const footerPad = createStickyFooterPad(keyboardOpen, tabBarLift(insets.bottom, 'sticky') + 8);
  const roomIndex = step === 'prompt' ? 0 : INTEREST_ROOM_SLUGS.indexOf(step) + 1;

  return (
    <BackdropSlot roomSlug={step === 'prompt' ? 'health_fitness' : step} playing={!onCard}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <RoomSlide roomKey={String(step)} direction={roomDir} reduceMotion={reduceMotion}>
          {onCard && cardChip && step !== 'prompt' ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingTop: 8,
                  paddingBottom: 8,
                }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => void onCardBack()}
                  style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
                  <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
                    Back
                  </AppText>
                </Pressable>
                <View style={{ flex: 1, minWidth: 0, paddingTop: 10, gap: 8 }}>
                  <AppText
                    className="text-[13px] font-semibold"
                    numberOfLines={1}
                    style={{ color: THEME.accentBright }}>
                    {cardChip.label} · {(cardIndex ?? 0) + 1} of {selectedChips.length}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {selectedChips.map((chip, index) => (
                      <View
                        key={chip.slug}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 999,
                          backgroundColor: index <= (cardIndex ?? 0) ? THEME.accent : THEME.border,
                        }}
                      />
                    ))}
                  </View>
                </View>
              </View>
              <ActivityCardPager ref={pagerRef} index={cardIndex ?? 0} reduceMotion={reduceMotion}>
                {selectedChips.map((chip, index) => (
                  <ActivityCard
                    key={chip.slug}
                    chip={chip}
                    room={step}
                    followUp={followUps[chip.slug] ?? emptyFollowUp(defaultQtyPeriod(chip))}
                    onChange={(next) => {
                      setFollowUps((current) => ({ ...current, [chip.slug]: next }));
                      setStances((current) => ({ ...current, [chip.slug]: stanceMarks(next.stanceScore) }));
                      setFormError(null);
                    }}
                    occupation={occupation}
                    employer={employer}
                    otherText={otherText}
                    onOccupation={setOccupation}
                    onEmployer={setEmployer}
                    onOtherText={setOtherText}
                    error={index === cardIndex ? formError : null}
                    units={units}
                  />
                ))}
              </ActivityCardPager>
            </View>
          ) : (
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AppText
                  className="text-[26px] font-extrabold"
                  style={{ color: THEME.primaryForeground, lineHeight: 32, flexShrink: 1 }}>
                  {title}
                </AppText>
                {bobCheck && step !== 'prompt' ? (
                  <AppText
                    className="text-[22px] font-extrabold"
                    style={{ color: THEME.accentBright }}>
                    ✓
                  </AppText>
                ) : null}
              </View>
              {step !== 'prompt' ? (
                <AppText className="text-[16px] font-semibold leading-5" style={{ color: THEME.primaryForeground }}>
                  {copy('interests.roomRequest', tone)}
                </AppText>
              ) : null}
              <AppText className="text-[15px] leading-5" style={{ color: THEME.accentBright }}>
                {sub}
              </AppText>

              {step !== 'prompt' ? (
                <ChipRow>
                  {chips.map((chip) => (
                    <View key={chip.slug} style={{ width: '31%', maxWidth: '31%' }}>
                      <Chip
                        label={chip.label}
                        selected={Boolean(stances[chip.slug])}
                        onPress={() => onChipPress(chip.slug)}
                        lines={2}
                        minHeight={44}
                      />
                    </View>
                  ))}
                  <View style={{ width: '31%', maxWidth: '31%' }}>
                    <Chip
                      label={copy('interests.none', tone)}
                      selected={noneOfThese}
                      onPress={() => onChipPress(NONE_CHIP_SLUG)}
                      lines={2}
                      minHeight={44}
                    />
                  </View>
                </ChipRow>
              ) : null}

              {formError ? (
                <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
                  {formError}
                </AppText>
              ) : null}
            </ScrollView>
          )}
        </RoomSlide>

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
          ) : onCard ? (
            <Button
              title={
                cardIndex === selectedChips.length - 1
                  ? copy('interests.done', tone)
                  : copy('interests.next', tone)
              }
              size="lg"
              onPress={() => void onCardNext()}
              loading={saveRoom.isPending || sliding}
            />
          ) : (
            <>
              <Button
                title={copy('interests.continue', tone)}
                size="lg"
                onPress={() => void onContinue()}
                loading={saveRoom.isPending}
              />
              <Button title={copy('interests.skip', tone)} variant="ghost" onPress={() => void onSkip()} />
            </>
          )}
        </View>
      </View>
      {onCard ? null : (
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
      )}
      <InterestsStartThisSheet
        visible={Boolean(startThis)}
        chipLabel={startThis?.chipLabel ?? ''}
        tone={tone}
        loading={dismissStartThis.isPending}
        onStart={() => void finishStartThis(true)}
        onNotNow={() => void finishStartThis(false)}
      />
    </BackdropSlot>
  );
}
