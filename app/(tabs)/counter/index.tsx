import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CounterDateField } from '@/components/counter/CounterDateField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardField, KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { KeyboardSheet } from '@/components/ui/KeyboardSheet';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useCreateCounter, useLiveCounters } from '@/hooks/useCounter';
import { firstRouteParam } from '@/lib/challengeLoad';
import {
  COUNTER_TEMPLATES,
  defaultCounterDate,
  defaultCounterTitle,
  formatCounterDate,
  pickLastLiveCounter,
} from '@/lib/counter/session';
import type { CounterKind, CounterTemplateId } from '@/lib/counter/types';
import { COUNTER_HISTORY_HREF, counterHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

export default function CounterHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ list?: string }>();
  const stayOnList = firstRouteParam(params.list) === '1';
  const insets = useSafeAreaInsets();
  const live = useLiveCounters();
  const create = useCreateCounter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [counterDate, setCounterDate] = useState(defaultCounterDate);
  const [templateId, setTemplateId] = useState<CounterTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stayOnList || !live.isSuccess) {
      return;
    }
    const last = pickLastLiveCounter(live.data ?? []);
    if (last) {
      router.replace(counterHref(last.id));
    }
  }, [live.data, live.isSuccess, router, stayOnList]);

  async function start() {
    setError(null);
    const template = COUNTER_TEMPLATES.find((row) => row.id === templateId);
    const metrics = template?.metrics ?? [{ name: 'Count', kind: 'count' as CounterKind }];
    try {
      const id = await create.mutateAsync({
        title: title.trim() || defaultCounterTitle(),
        counterDate,
        metrics,
      });
      setOpen(false);
      setTitle('');
      setTemplateId(null);
      setCounterDate(defaultCounterDate());
      router.push(counterHref(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start that counter.');
    }
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <AppText style={{ flex: 1, fontSize: 24, fontWeight: '800', color: THEME.textPrimary }}>Counter</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="History"
          onPress={() => router.push(COUNTER_HISTORY_HREF)}
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
          <Glyph name={GLYPH.clock} color={THEME.textPrimary} size={13} />
          <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textPrimary }}>History</AppText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarLift(insets.bottom, 'sticky') + 88, gap: 10 }}>
        {(live.data ?? []).length === 0 ? (
          <AppText style={{ color: THEME.textMuted }}>No live counters yet.</AppText>
        ) : null}
        {(live.data ?? []).map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            onPress={() => router.push(counterHref(row.id))}
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: THEME.surface,
              borderWidth: 1,
              borderColor: THEME.border,
              ...themeShadow('card'),
            }}>
            <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>{row.title}</AppText>
            <AppText style={{ marginTop: 2, fontSize: 12, color: THEME.textMuted }}>
              {formatCounterDate(row.counterDate)}
            </AppText>
            <AppText style={{ marginTop: 4, fontSize: 13, color: THEME.textMuted }}>{row.line || 'No numbers yet'}</AppText>
          </Pressable>
        ))}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
          backgroundColor: THEME.surface,
          borderTopWidth: 1,
          borderTopColor: THEME.border,
        }}>
        <Button
          title="New counter"
          onPress={() => {
            setCounterDate(defaultCounterDate());
            setOpen(true);
          }}
        />
      </View>

      <ChromeOverlay visible={open} onClose={() => setOpen(false)} align="end" zIndex={130}>
        <KeyboardSheet>
          <KeyboardFormShell
            protectFieldFocus
            footer={<Button title={create.isPending ? 'Starting…' : 'Start'} loading={create.isPending} onPress={() => void start()} />}>
            <AppText style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>New counter</AppText>
            <KeyboardField>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Wednesday sales"
                placeholderTextColor={THEME.textMuted}
                accessibilityLabel="Title"
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
            <CounterDateField value={counterDate} onChange={setCounterDate} />
            <AppText style={{ marginTop: 14, fontSize: 13, fontWeight: '700', color: THEME.textMuted }}>Starter</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {COUNTER_TEMPLATES.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setTemplateId(row.id)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: templateId === row.id ? THEME.accent : THEME.border,
                    backgroundColor: templateId === row.id ? THEME.accentSoft : THEME.surface,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{row.label}</AppText>
                </Pressable>
              ))}
            </View>
            {error ? <AppText style={{ marginTop: 10, color: THEME.danger }}>{error}</AppText> : null}
          </KeyboardFormShell>
        </KeyboardSheet>
      </ChromeOverlay>
    </Screen>
  );
}
