import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  useCirclePinCandidates,
  useCirclePins,
  usePinChallengeToCircle,
  useReorderCirclePins,
  useUnpinCircleChallenge,
} from '@/hooks/useCircles';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { CIRCLE_PIN_CAP, type CirclePin } from '@/lib/circles';
import { copy } from '@/lib/copy';
import { challengeHref } from '@/lib/routes';
import { pushChallengeHref } from '@/lib/challengeNav';
import { flexChildMin, THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

function statusChip(pin: CirclePin, viewerId?: string | null): string {
  if (viewerId && pin.created_by === viewerId) {
    return 'Host';
  }
  const status = String(pin.status ?? '').toLowerCase();
  if (status === 'live' || status === 'in_progress') {
    return 'Live';
  }
  if (status === 'completed' || status === 'settled') {
    return 'Done';
  }
  if (status === 'cancelled') {
    return 'Cancelled';
  }
  return 'Open';
}

export function CirclePinsSection({
  circleId,
  isHost,
}: {
  circleId: string;
  isHost: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pins = useCirclePins(circleId);
  const unpin = useUnpinCircleChallenge(circleId);
  const reorder = useReorderCirclePins(circleId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rows = pins.data ?? [];
  const empty = !pins.isLoading && rows.length === 0;

  function fail(error: unknown) {
    Alert.alert('Couldn’t update pins', getErrorMessage(error));
  }

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= rows.length) {
      return;
    }
    const ids = rows.map((row) => row.challenge_id);
    const swap = ids[index]!;
    ids[index] = ids[next]!;
    ids[next] = swap;
    reorder.mutate(ids, { onError: fail });
  }

  return (
    <View className="gap-3">
      <AppText className="text-[16px] font-extrabold text-charcoal">{copy('circles.challenges')}</AppText>
      {empty && isHost ? (
        <View
          className="gap-3 p-4"
          style={{
            borderRadius: THEME.radius,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
            ...themeShadow('card'),
          }}>
          <AppText className="text-[15px] text-charcoal">{copy('circles.pinEmptyHost')}</AppText>
          <Button title={copy('circles.pin')} onPress={() => setSheetOpen(true)} />
        </View>
      ) : null}
      {empty && !isHost ? (
        <View className="items-center py-2">
          <BlobMascot variant="wave" size={72} />
          <AppText className="mt-2 text-center text-[14px] text-muted">{copy('circles.pinEmptyVisitor')}</AppText>
        </View>
      ) : null}
      {rows.map((pin, index) => (
        <View
          key={pin.challenge_id}
          className="flex-row items-center p-3"
          style={{
            gap: 10,
            borderRadius: THEME.radius,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
            ...themeShadow('card'),
          }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: THEME.circleSoft,
            }}>
            {pin.cover_image_url ? (
              <Image source={{ uri: pin.cover_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View className="flex-1 items-center justify-center">
                <BlobMascot variant="wave" size={40} />
              </View>
            )}
          </View>
          <View style={[flexChildMin(), { flex: 1, gap: 6 }]}>
            <AppText className="text-[15px] font-extrabold text-charcoal" numberOfLines={2}>
              {pin.title || 'Challenge'}
            </AppText>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: THEME.accentSoft,
              }}>
              <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
                {statusChip(pin, user?.id)}
              </AppText>
            </View>
            {isHost ? (
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {index > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy('circles.pinUp')}
                    onPress={() => move(index, -1)}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      {copy('circles.pinUp')}
                    </AppText>
                  </Pressable>
                ) : null}
                {index < rows.length - 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy('circles.pinDown')}
                    onPress={() => move(index, 1)}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      {copy('circles.pinDown')}
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy('circles.unpin')}
                  onPress={() => unpin.mutate(pin.challenge_id, { onError: fail })}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.danger }}>
                    {copy('circles.unpin')}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('circles.viewChallenge')}
            onPress={() =>
              pushChallengeHref(router, String(challengeHref(pin.challenge_id)), 'circle-pin', pin.challenge_id, pathname)
            }
            style={{ minHeight: 44, minWidth: 52, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-extrabold" style={{ color: THEME.accent }}>
              {copy('circles.viewChallenge')}
            </AppText>
          </Pressable>
        </View>
      ))}
      {isHost && !empty ? (
        <Button
          title={copy('circles.pin')}
          variant="outline"
          disabled={rows.length >= CIRCLE_PIN_CAP}
          onPress={() => {
            if (rows.length >= CIRCLE_PIN_CAP) {
              Alert.alert(copy('circles.pinCap'));
              return;
            }
            setSheetOpen(true);
          }}
        />
      ) : null}
      <CirclePinSheet
        circleId={circleId}
        visible={sheetOpen}
        pinnedIds={new Set(rows.map((row) => row.challenge_id))}
        pinCount={rows.length}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

function CirclePinSheet({
  circleId,
  visible,
  pinnedIds,
  pinCount,
  onClose,
}: {
  circleId: string;
  visible: boolean;
  pinnedIds: Set<string>;
  pinCount: number;
  onClose: () => void;
}) {
  const candidates = useCirclePinCandidates(visible);
  const pin = usePinChallengeToCircle(circleId);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (candidates.data ?? []).filter((row) => {
      if (pinnedIds.has(row.id)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return challengeDisplayTitle(row).toLowerCase().includes(needle);
    });
  }, [candidates.data, pinnedIds, query]);

  function close() {
    if (pin.isPending) {
      return;
    }
    setQuery('');
    onClose();
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <View
        className="max-h-[88%] px-5 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: 16,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-xl font-bold text-charcoal">{copy('circles.pinSheet')}</AppText>
        <View className="mt-3">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={copy('circles.pinSearch')}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <ScrollView className="mt-3" style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? (
            <AppText className="mt-2 text-[14px] text-muted">
              {candidates.isLoading ? 'Looking up challenges.' : 'No challenges match that.'}
            </AppText>
          ) : (
            rows.map((row) => {
              const title = challengeDisplayTitle(row) || 'Challenge';
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  onPress={() => {
                    if (pinCount >= CIRCLE_PIN_CAP) {
                      Alert.alert(copy('circles.pinCap'));
                      return;
                    }
                    pin.mutate(row.id, {
                      onSuccess: close,
                      onError: (error) => Alert.alert('Couldn’t pin that', getErrorMessage(error)),
                    });
                  }}
                  className="flex-row items-center py-3"
                  style={{ minHeight: 44, gap: 10, borderBottomWidth: 1, borderBottomColor: THEME.border }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      overflow: 'hidden',
                      backgroundColor: THEME.circleSoft,
                    }}>
                    {row.cover_image_url ? (
                      <Image
                        source={{ uri: row.cover_image_url }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : null}
                  </View>
                  <View style={flexChildMin()}>
                    <AppText className="text-[15px] font-semibold text-charcoal" numberOfLines={2}>
                      {title}
                    </AppText>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <View className="mt-3">
          <Button title="Close" variant="ghost" onPress={close} disabled={pin.isPending} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
