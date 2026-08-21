import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getLastAppErrorCode } from '@/lib/appErrors';
import { STORAGE_BUCKETS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { uploadBugReportImage } from '@/utils/upload';

export type BugReportMeta = {
  user_id: string;
  route: string | null;
  user_agent: string;
  app_version: string;
  created_at: string;
  last_error_code: string | null;
};

export type BugReportRow = {
  id: string;
  user_id: string | null;
  route: string | null;
  message: string | null;
  image_path: string | null;
  meta: BugReportMeta | Record<string, unknown> | null;
  created_at: string;
};

export type AdminBugReport = BugReportRow & {
  username?: string | null;
  thumbUrl?: string | null;
  imageUrl?: string | null;
};

export type BugReportAttachment = {
  uri: string;
  mimeType?: string | null;
  blob?: Blob | null;
  size?: number | null;
};

function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

function userAgent(): string {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.userAgent) {
    return navigator.userAgent.slice(0, 400);
  }
  return `${Platform.OS} ${String(Platform.Version)}`;
}

export async function submitBugReport(input: {
  message: string;
  route: string;
  attachment?: BugReportAttachment | null;
}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) {
    throw new Error('Sign in to send a report.');
  }
  const createdAt = new Date().toISOString();
  let imagePath: string | null = null;
  if (input.attachment?.uri) {
    imagePath = await uploadBugReportImage({
      uri: input.attachment.uri,
      userId,
      mimeType: input.attachment.mimeType,
      blob: input.attachment.blob,
      size: input.attachment.size,
    });
  }
  const meta: BugReportMeta = {
    user_id: userId,
    route: input.route || null,
    user_agent: userAgent(),
    app_version: appVersion(),
    created_at: createdAt,
    last_error_code: getLastAppErrorCode(),
  };
  const { error } = await supabase.from('bug_reports').insert({
    user_id: userId,
    route: input.route.slice(0, 200) || null,
    message: input.message.trim().slice(0, 4000),
    image_path: imagePath,
    meta,
  });
  if (error) {
    throw error;
  }
}

export async function fetchAdminBugReports(): Promise<AdminBugReport[]> {
  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, user_id, route, message, image_path, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as BugReportRow[];
  const ids = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const profiles = await supabase.from('profiles').select('id, username').in('id', ids);
    for (const profile of profiles.data ?? []) {
      const row = profile as { id: string; username?: string | null };
      if (row.username) {
        names.set(row.id, row.username);
      }
    }
  }
  const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const result = await supabase.storage.from(STORAGE_BUCKETS.bugReports).createSignedUrls(paths, 3600);
    for (const item of result.data ?? []) {
      if (item.path && item.signedUrl) {
        signed.set(item.path, item.signedUrl);
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    username: row.user_id ? names.get(row.user_id) ?? null : null,
    thumbUrl: row.image_path ? signed.get(row.image_path) ?? null : null,
    imageUrl: row.image_path ? signed.get(row.image_path) ?? null : null,
  }));
}
