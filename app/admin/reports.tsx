import { format } from 'date-fns';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAdminBugReports } from '@/hooks/useAdmin';
import type { AdminBugReport } from '@/lib/bugReports';
import { THEME, themeShadow } from '@/lib/theme';

function when(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'MMM d, h:mm a');
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const reports = useAdminBugReports(true);
  const [open, setOpen] = useState<AdminBugReport | null>(null);
  const meta = useMemo(() => {
    if (!open?.meta) {
      return '{}';
    }
    try {
      return JSON.stringify(open.meta, null, 2);
    } catch {
      return String(open.meta);
    }
  }, [open]);

  return (
    <Screen scroll>
      <View className="gap-3 pb-6 pt-1">
        <AppText className="text-[13px] text-muted">Newest first. No email. Bob looks here.</AppText>
        {reports.isLoading && !reports.data ? (
          <MascotState kind="loading" title="Loading reports…" compact />
        ) : reports.error ? (
          <MascotState
            kind="error"
            title="Couldn’t load reports"
            body="Try again in a moment."
            actionLabel="Retry"
            onAction={() => void reports.refetch()}
            compact
          />
        ) : (reports.data ?? []).length === 0 ? (
          <MascotState kind="empty" title="No reports yet" compact />
        ) : (
          (reports.data ?? []).map((row) => (
            <Pressable key={row.id} accessibilityRole="button" onPress={() => setOpen(row)}>
              <Card>
                <View className="flex-row gap-3">
                  {row.thumbUrl ? (
                    <Image
                      source={{ uri: row.thumbUrl }}
                      style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: THEME.surface2 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        backgroundColor: THEME.surface2,
                      }}
                    />
                  )}
                  <View className="min-w-0 flex-1">
                    <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={2}>
                      {row.message || '—'}
                    </AppText>
                    <AppText className="mt-1 text-[12px] text-muted" numberOfLines={1}>
                      {row.username ? `@${row.username}` : row.user_id?.slice(0, 8) ?? '—'} · {row.route ?? '—'}
                    </AppText>
                    <AppText className="mt-0.5 text-[11px] text-muted">{when(row.created_at)}</AppText>
                  </View>
                </View>
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
            <AppText className="text-[16px] font-extrabold text-charcoal">Report</AppText>
            <AppText className="mt-1 text-[13px] text-muted">
              {open?.username ? `@${open.username}` : '—'} · {open?.route ?? '—'} · {open ? when(open.created_at) : ''}
            </AppText>
            <ScrollView style={{ marginTop: 12, maxHeight: 420 }}>
              {open?.imageUrl ? (
                <Image
                  source={{ uri: open.imageUrl }}
                  style={{ width: '100%', height: 240, borderRadius: 16, backgroundColor: THEME.surface2 }}
                  contentFit="contain"
                />
              ) : null}
              <AppText className="mt-3 text-[15px] leading-5 text-charcoal">{open?.message ?? '—'}</AppText>
              {open?.username ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/profile/u/[username]',
                      params: { username: open.username as string },
                    })
                  }
                  style={{ minHeight: 40, justifyContent: 'center' }}>
                  <AppText className="font-semibold" style={{ color: THEME.accent }}>
                    @{open.username}
                  </AppText>
                </Pressable>
              ) : null}
              <AppText className="mt-3 text-[12px] font-semibold text-muted">Meta</AppText>
              <AppText className="mt-1 text-[12px] leading-5 text-charcoal">{meta}</AppText>
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
