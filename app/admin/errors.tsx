import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAdminErrors } from '@/hooks/useAdmin';
import type { AdminErrorView } from '@/lib/admin';
import { THEME, themeShadow } from '@/lib/theme';

function when(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'MMM d, h:mm a');
}

export default function AdminErrorsScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [open, setOpen] = useState<AdminErrorView | null>(null);
  const errors = useAdminErrors(true);
  const rows = useMemo(() => {
    const needle = code.trim().toLowerCase();
    const all = errors.data ?? [];
    if (!needle) {
      return all;
    }
    return all.filter((row) => (row.code ?? '').toLowerCase().includes(needle));
  }, [code, errors.data]);
  const payload = useMemo(() => {
    if (!open?.payload) {
      return '{}';
    }
    try {
      return JSON.stringify(open.payload, null, 2);
    } catch {
      return String(open.payload);
    }
  }, [open]);

  return (
    <Screen scroll>
      <View className="gap-3 pb-6 pt-1">
        <AppText className="text-[13px] text-muted">Last 200, newest first. Codes stay here — users never see them.</AppText>
        <Input
          label="Filter by code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="42703"
        />

        {errors.isLoading && !errors.data ? (
          <MascotState kind="loading" title="Loading errors…" compact />
        ) : errors.error ? (
          <MascotState
            kind="error"
            title="Couldn’t load errors"
            body="Try again in a moment."
            actionLabel="Retry"
            onAction={() => void errors.refetch()}
            compact
          />
        ) : rows.length === 0 ? (
          <MascotState kind="empty" title="No errors in this filter" compact />
        ) : (
          rows.map((row) => (
            <Pressable key={row.id} accessibilityRole="button" onPress={() => setOpen(row)}>
              <Card>
                <View className="flex-row items-start justify-between gap-3">
                  <AppText className="text-[11px] text-muted">{when(row.created_at)}</AppText>
                  <AppText className="text-[12px] font-bold" style={{ color: THEME.danger }}>
                    {row.code ?? '—'}
                  </AppText>
                </View>
                <AppText className="mt-1 text-[13px] font-semibold text-charcoal" numberOfLines={1}>
                  {row.route ?? '—'}
                </AppText>
                <AppText className="mt-0.5 text-[13px] text-muted" numberOfLines={2}>
                  {row.message ?? '—'}
                </AppText>
                {row.username ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/profile/u/[username]',
                        params: { username: row.username as string },
                      })
                    }
                    style={{ minHeight: 36, justifyContent: 'center' }}>
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      @{row.username}
                    </AppText>
                  </Pressable>
                ) : (
                  <AppText className="mt-1 text-[12px] text-muted">{row.user_id ? row.user_id.slice(0, 8) : '—'}</AppText>
                )}
              </Card>
            </Pressable>
          ))
        )}
      </View>

      <Modal visible={Boolean(open)} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(null)}
          style={{ flex: 1, backgroundColor: 'rgba(16,19,18,0.35)', justifyContent: 'center', padding: 16 }}>
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: THEME.surface,
              borderRadius: THEME.radius,
              borderWidth: 1,
              borderColor: THEME.border,
              maxHeight: '80%',
              padding: 16,
              ...themeShadow('card'),
            }}>
            <AppText className="text-[16px] font-extrabold text-charcoal">Payload</AppText>
            <AppText className="mt-1 text-[12px] text-muted">
              {open?.code ?? '—'} · {open?.route ?? '—'}
            </AppText>
            <ScrollView style={{ marginTop: 12, maxHeight: 360 }}>
              <AppText className="text-[12px] leading-5 text-charcoal">{payload}</AppText>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(null)}
              className="mt-3 items-center justify-center"
              style={{ minHeight: 44 }}>
              <AppText className="font-semibold" style={{ color: THEME.accent }}>
                Close
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
