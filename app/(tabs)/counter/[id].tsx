import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CounterCardRaster } from '@/components/counter/CounterCardRaster';
import { CounterDateField } from '@/components/counter/CounterDateField';
import { CounterLiveFooter, CounterSavedFooter } from '@/components/counter/CounterFooter';
import { CounterShareSheet, type CounterShareChoice } from '@/components/counter/CounterShareSheet';
import { MetricCard } from '@/components/counter/MetricCard';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardField, KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { KeyboardSheet } from '@/components/ui/KeyboardSheet';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import {
  useCounter,
  useCreateCounter,
  useDeleteCounter,
  useSaveCounter,
  useSetCounterCardUrl,
  useSnapshotCounter,
  useTouchCounterOpened,
} from '@/hooks/useCounter';
import { useLoggableChallenges } from '@/hooks/useLoggableChallenge';
import {
  useCreateGroupConversation,
  useGetOrCreateConversation,
  useSendMessage,
} from '@/hooks/useSocial';
import { firstRouteParam } from '@/lib/challengeLoad';
import { buildCounterCard } from '@/lib/counter/card';
import { dataUrlToBlob, renderCounterCardDataUrl } from '@/lib/counter/cardCanvas';
import { saveCounterImage } from '@/lib/counter/saveImage';
import {
  addCounterMetric,
  blankLiveFrom,
  clampCounterName,
  clearCounterValues,
  defaultCounterTitle,
  removeCounterMetric,
  renameCounterMetric,
  setCounterMetricValue,
} from '@/lib/counter/session';
import { sendCounterToRecipients, shareCounterCard } from '@/lib/counter/share';
import { COUNTER_KINDS, COUNTER_METRIC_MAX, type CounterDraft, type CounterKind } from '@/lib/counter/types';
import { COUNTER_HISTORY_HREF, COUNTER_LIST_HREF, COUNTER_START_HREF, counterHref } from '@/lib/routes';
import { tabBarLift, THEME } from '@/lib/theme';
import { uploadPostAttachment } from '@/utils/upload';

const AUTOSAVE_MS = 700;

export default function CounterSheetScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = firstRouteParam(params.id);
  return <CounterSheetInner key={id || 'counter'} id={id} />;
}

function CounterSheetInner({ id }: { id: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const loaded = useCounter(id);
  const persist = useSaveCounter();
  const snapshot = useSnapshotCounter();
  const create = useCreateCounter();
  const remove = useDeleteCounter();
  const setCardUrl = useSetCounterCardUrl();
  const touchOpened = useTouchCounterOpened();
  const loggable = useLoggableChallenges();
  const startChat = useGetOrCreateConversation();
  const startGroup = useCreateGroupConversation();
  const sendMessage = useSendMessage();

  const [draft, setDraft] = useState<CounterDraft | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addKind, setAddKind] = useState<CounterKind>('count');
  const [confirm, setConfirm] = useState<'clear' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raster, setRaster] = useState<{ key: string; card: ReturnType<typeof buildCounterCard> } | null>(
    null,
  );

  const dirty = useRef(false);
  const draftRef = useRef<CounterDraft | null>(null);
  const pendingShare = useRef<CounterShareChoice | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    if (loaded.data && !draftRef.current) {
      setDraft(loaded.data);
    }
  }, [loaded.data]);

  useEffect(() => {
    if (!id || loaded.data?.status !== 'live') {
      return;
    }
    void touchOpened.mutateAsync(id).catch(() => undefined);
    // Open once per sheet. Do not re-run when the mutation identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loaded.data?.status]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const writeDraft = useCallback(async (next: CounterDraft) => {
    try {
      await persistRef.current.mutateAsync(next);
      setError(null);
    } catch (caught) {
      dirty.current = true;
      setError(caught instanceof Error ? caught.message : 'Could not keep those numbers.');
    }
  }, []);

  const flush = useCallback(() => {
    const pending = draftRef.current;
    if (pending && dirty.current && pending.status === 'live') {
      dirty.current = false;
      void writeDraft(pending);
    }
  }, [writeDraft]);

  useEffect(() => {
    if (!draft || draft.status === 'saved' || !dirty.current) {
      return;
    }
    const handle = setTimeout(() => {
      const next = draftRef.current;
      if (!next || next.status === 'saved' || !dirty.current) {
        return;
      }
      dirty.current = false;
      void writeDraft(next);
    }, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [draft, writeDraft]);

  useEffect(() => () => flush(), [flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        flush();
      }
    });
    return () => sub.remove();
  }, [flush]);

  const readOnly = draft?.status === 'saved';
  const challenges = (loggable.data ?? []).filter((row) => row.status !== 'ended');

  function patch(next: CounterDraft, immediate = false) {
    if (next.status === 'saved') {
      return;
    }
    const written = { ...next, cardUrl: null, updatedAt: new Date().toISOString() };
    dirty.current = !immediate;
    setDraft(written);
    if (immediate) {
      void writeDraft(written);
    }
  }

  function goBack() {
    if (readOnly) {
      router.replace(COUNTER_HISTORY_HREF);
      return;
    }
    router.replace(COUNTER_LIST_HREF);
  }

  const backHeader = {
    headerShown: true as const,
    presentation: 'card' as const,
    animation: 'slide_from_right' as const,
    gestureEnabled: true,
    headerBackVisible: false,
    headerLeft: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
        hitSlop={8}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={GLYPH.chevronLeft} color={THEME.textPrimary} size={18} />
      </Pressable>
    ),
  };

  async function onSave() {
    if (!draft || draft.status === 'saved') {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await snapshot.mutateAsync(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that snapshot.');
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!draft || draft.status === 'saved') {
      return;
    }
    setConfirm(null);
    patch(clearCounterValues(draft), true);
  }

  async function onStartAgain() {
    if (!draft) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const blank = blankLiveFrom(draft);
      const nextId = await create.mutateAsync({
        title: blank.title,
        counterDate: blank.counterDate,
        metrics: blank.metrics.map((row) => ({ name: row.name, kind: row.kind })),
      });
      router.replace(counterHref(nextId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start that again.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!draft) {
      return;
    }
    setConfirm(null);
    setBusy(true);
    try {
      await remove.mutateAsync(draft.id);
      router.replace(COUNTER_HISTORY_HREF);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete that.');
    } finally {
      setBusy(false);
    }
  }

  function onAddMetric() {
    if (!draft || draft.status === 'saved') {
      return;
    }
    const name = clampCounterName(addName) || `Metric ${draft.metrics.length + 1}`;
    patch(addCounterMetric(draft, { name, kind: addKind }));
    setAddName('');
    setAddKind('count');
    setAddOpen(false);
  }

  async function publish(choice: CounterShareChoice, cardUrl: string, blob?: Blob | null) {
    if (!draft || !user?.id) {
      return;
    }
    if (choice.destination === 'image') {
      await saveCounterImage(cardUrl);
      return;
    }
    const remote =
      cardUrl.startsWith('http://') || cardUrl.startsWith('https://')
        ? cardUrl
        : await uploadPostAttachment({
            uri: cardUrl,
            userId: user.id,
            fileStem: `counter-${draft.id}`,
            mimeType: 'image/png',
            blob: blob ?? null,
          });
    if (draft.status === 'saved') {
      await setCardUrl.mutateAsync({ id: draft.id, cardUrl: remote });
      setDraft({ ...draft, cardUrl: remote });
    }
    const hideHome =
      choice.hideHome || choice.destination === 'wave' || choice.destination === 'message';
    const result = await shareCounterCard({
      card: buildCounterCard(draft),
      cardUrl: remote,
      caption: choice.caption,
      destination: choice.destination,
      challengeId: choice.destination === 'live' ? choice.challengeId : null,
      circleId: choice.destination === 'circle' ? choice.circleId : null,
      hideHome,
      audience: choice.audience,
      audienceUserIds: choice.recipientIds,
    });
    if (choice.destination === 'message' && result.postId && choice.recipientIds.length) {
      await sendCounterToRecipients({
        postId: result.postId,
        recipientIds: choice.recipientIds,
        caption: choice.caption,
        startChat: (friendId) => startChat.mutateAsync(friendId),
        startGroup: (friendIds) => startGroup.mutateAsync(friendIds),
        send: (message) => sendMessage.mutateAsync(message).then(() => undefined),
      });
    }
  }

  async function onShare(choice: CounterShareChoice) {
    if (!draft) {
      return;
    }
    setShareError(null);
    setBusy(true);
    try {
      if (choice.destination === 'live' && !choice.challengeId) {
        throw new Error('Pick a Live room.');
      }
      if (choice.destination === 'circle' && !choice.circleId) {
        throw new Error('Pick a circle.');
      }
      if (choice.destination === 'message' && !choice.recipientIds.length) {
        throw new Error('Pick someone to message.');
      }
      if (draft.status === 'saved' && draft.cardUrl) {
        await publish(choice, draft.cardUrl);
        setShareOpen(false);
        return;
      }
      pendingShare.current = choice;
      setRaster({ key: draft.id, card: buildCounterCard(draft) });
    } catch (caught) {
      setShareError(caught instanceof Error ? caught.message : 'Could not share that.');
      setBusy(false);
    }
  }

  async function finishRaster(fileUri: string, blob?: Blob | null) {
    const choice = pendingShare.current;
    pendingShare.current = null;
    setRaster(null);
    if (!choice) {
      setBusy(false);
      return;
    }
    try {
      await publish(choice, fileUri, blob);
      setShareOpen(false);
    } catch (caught) {
      setShareError(caught instanceof Error ? caught.message : 'Could not share that.');
    } finally {
      setBusy(false);
    }
  }

  if (loaded.isLoading || (!draft && !loaded.isFetched)) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ ...backHeader, title: 'Counter' }} />
        <MascotState kind="loading" title="Loading your counter…" />
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ ...backHeader, title: 'Counter' }} />
        <MascotState
          kind="empty"
          title="That counter isn’t here"
          body="It may have been deleted."
          actionLabel="New counter"
          onAction={() => router.replace(COUNTER_START_HREF)}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
      <Stack.Screen options={{ ...backHeader, title: draft.title || 'Counter' }} />
      <KeyboardFormShell
        padded
        protectFieldFocus
        closedFooterPad={tabBarLift(insets.bottom, 'sticky')}
        footer={
          readOnly ? (
            <CounterSavedFooter
              busy={busy}
              onShare={() => {
                setShareError(null);
                setShareOpen(true);
              }}
              onStartAgain={() => void onStartAgain()}
              onDelete={() => setConfirm('delete')}
            />
          ) : (
            <CounterLiveFooter
              busy={busy}
              onClear={() => setConfirm('clear')}
              onSave={() => void onSave()}
              onShare={() => {
                setShareError(null);
                setShareOpen(true);
              }}
            />
          )
        }>
        <KeyboardField>
          <TextInput
            value={draft.title}
            editable={!readOnly}
            onChangeText={(title) => patch({ ...draft, title })}
            onBlur={() => {
              if (!readOnly && !clampCounterName(draft.title)) {
                patch({ ...draft, title: defaultCounterTitle() });
              }
            }}
            placeholder="Wednesday sales"
            placeholderTextColor={THEME.textMuted}
            accessibilityLabel="Title"
            style={{
              minHeight: 48,
              fontSize: 22,
              fontWeight: '800',
              color: THEME.textPrimary,
              padding: 0,
            }}
          />
        </KeyboardField>
        <CounterDateField
          value={draft.counterDate}
          readOnly={readOnly}
          onChange={(counterDate) => patch({ ...draft, counterDate }, true)}
        />
        <View style={{ marginTop: 14, gap: 12 }}>
          {draft.metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              readOnly={readOnly}
              onChange={(value) => patch(setCounterMetricValue(draft, metric.key, value), true)}
              onRename={(name) => patch(renameCounterMetric(draft, metric.key, name))}
              onRemove={() => patch(removeCounterMetric(draft, metric.key), true)}
            />
          ))}
        </View>
        {readOnly || draft.metrics.length >= COUNTER_METRIC_MAX ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add metric"
            onPress={() => setAddOpen(true)}
            style={{
              marginTop: 12,
              minHeight: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: THEME.border,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}>
            <Glyph name={GLYPH.plus} color={THEME.textPrimary} size={14} />
            <AppText style={{ fontWeight: '800', color: THEME.textPrimary }}>Add metric</AppText>
          </Pressable>
        )}
        {error ? <AppText style={{ marginTop: 10, color: THEME.danger }}>{error}</AppText> : null}
      </KeyboardFormShell>

      <ChromeOverlay visible={addOpen} onClose={() => setAddOpen(false)} align="end" zIndex={130}>
        <KeyboardSheet>
          <KeyboardFormShell
            protectFieldFocus
            footer={<Button title="Add" onPress={onAddMetric} />}>
            <AppText style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>Add metric</AppText>
            <KeyboardField>
              <TextInput
                value={addName}
                onChangeText={setAddName}
                placeholder="Dials"
                placeholderTextColor={THEME.textMuted}
                accessibilityLabel="Metric name"
                style={{
                  marginTop: 12,
                  minHeight: 48,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  paddingHorizontal: 12,
                  color: THEME.textPrimary,
                }}
              />
            </KeyboardField>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {COUNTER_KINDS.map((kind) => (
                <Pressable
                  key={kind}
                  onPress={() => setAddKind(kind)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: addKind === kind ? THEME.accent : THEME.border,
                    backgroundColor: addKind === kind ? THEME.accentSoft : THEME.surface,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>
                    {kind === 'money' ? 'Money' : kind === 'decimal' ? 'Decimal' : 'Count'}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </KeyboardFormShell>
        </KeyboardSheet>
      </ChromeOverlay>

      <ChromeOverlay visible={Boolean(confirm)} onClose={() => setConfirm(null)} align="end" zIndex={135}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 20,
            gap: 12,
          }}>
          <AppText style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
            {confirm === 'clear' ? 'Clear these numbers?' : 'Delete this snapshot?'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={() => setConfirm(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={confirm === 'clear' ? 'Clear' : 'Delete'}
                onPress={() => void (confirm === 'clear' ? onClear() : onDelete())}
              />
            </View>
          </View>
        </View>
      </ChromeOverlay>

      <CounterShareSheet
        visible={shareOpen}
        draft={draft}
        challenges={challenges}
        busy={busy}
        error={shareError}
        onClose={() => {
          if (!busy) {
            setShareOpen(false);
          }
        }}
        onShare={(choice) => void onShare(choice)}
      />
      <CounterCardRaster
        request={raster}
        onRendered={(_key, fileUri) => {
          void finishRaster(fileUri);
        }}
        onFailed={(_key, message) => {
          if (message === 'web-fallback' && draft) {
            try {
              const dataUrl = renderCounterCardDataUrl(buildCounterCard(draft));
              void dataUrlToBlob(dataUrl).then((blob) => finishRaster(dataUrl, blob));
            } catch (caught) {
              pendingShare.current = null;
              setRaster(null);
              setBusy(false);
              setShareError(caught instanceof Error ? caught.message : 'Could not build that card.');
            }
            return;
          }
          pendingShare.current = null;
          setRaster(null);
          setBusy(false);
          setShareError(message);
        }}
      />
    </Screen>
  );
}
