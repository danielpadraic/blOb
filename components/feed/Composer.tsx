import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, View, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { AudienceIconButton } from '@/components/feed/AudienceSheet';
import { GifPicker } from '@/components/feed/GifPicker';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ChallengeInviteCard } from '@/components/challenge/ChallengeInviteCard';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  clearComposerDraft,
  composerDraftKey,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftAttachment,
} from '@/lib/composerDraft';
import { asCopyTone, copy } from '@/lib/copy';
import { ensureLibraryPermission, openAppSettings, permissionCopy } from '@/lib/mediaPermissions';
import {
  asDefaultPostAudience,
  type PostAudience,
} from '@/lib/postAudience';
import { captureHref } from '@/lib/routes';
import { type FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { MentionDoc } from '@/lib/mentions';
import { wallHostLabel } from '@/lib/profileWall';
import { supabase } from '@/lib/supabase';
import type { ComposeInput, QuoteSnapshot } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { asGalleryMedia, localUriFromPickerAsset } from '@/utils/media';
import { uploadPostAttachment } from '@/utils/upload';
import { posterUriFor } from '@/lib/videoPoster';
import { uploadProgressPercent } from '@/lib/uploadProgress';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Attachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'gif';
  mimeType?: string | null;
  name?: string;
  size?: number | null;
  blob?: Blob | null;
  remoteUrl?: string | null;
  progress?: number | null;
  error?: string | null;
  poster?: string | null;
};

type ComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  autoFocus?: boolean;
  initialText?: string;
  attachedChallenge?: FeedChallengePreview | null;
  audienceOptions?: { value: PostAudience; label: string }[];
  defaultAudience?: PostAudience;
  hideAudience?: boolean;
  quote?: { postId: string; snapshot: QuoteSnapshot; audience?: string | null } | null;
  wallHost?: { id: string; name?: string | null; username?: string | null } | null;
  tall?: boolean;
  draftKey?: string;
  idleUntilFocus?: boolean;
  onSubmit: (input: ComposeInput) => Promise<unknown> | void;
};

export function Composer({
  placeholder,
  submitting,
  autoFocus,
  initialText,
  attachedChallenge,
  audienceOptions,
  defaultAudience,
  hideAudience,
  quote,
  wallHost,
  tall = false,
  draftKey,
  idleUntilFocus = false,
  onSubmit,
}: ComposerProps) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const resolvedPlaceholder = placeholder ?? copy('home.composer', asCopyTone(profile?.motivation_tone));
  const router = useRouter();
  const social = useSocialSheetsOptional();
  const profileDefault = asDefaultPostAudience(profile?.default_post_audience);
  const scope = composerDraftKey(draftKey ?? 'home');
  const stored = readComposerDraft(scope);
  const fieldRef = useRef<MentionFieldHandle>(null);
  const docRef = useRef<MentionDoc>(stored?.doc ?? { text: initialText ?? '', chips: [] });
  const holdFocus = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldKey, setFieldKey] = useState(0);
  const [hasText, setHasText] = useState(Boolean((stored?.doc.text ?? initialText)?.trim()));
  const [attachments, setAttachments] = useState<Attachment[]>(stored?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [expanded, setExpanded] = useState(
    () =>
      !idleUntilFocus ||
      Boolean(autoFocus) ||
      Boolean((stored?.doc.text ?? initialText)?.trim()) ||
      Boolean(stored?.attachments?.length),
  );
  const allowPublic = !audienceOptions || audienceOptions.some((item) => item.value === 'public');
  const [audience, setAudience] = useState<PostAudience>(
    hideAudience ? 'public' : (defaultAudience ?? (wallHost ? 'friends' : profileDefault)),
  );
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (hideAudience || defaultAudience || wallHost) {
      return;
    }
    setAudience(profileDefault);
  }, [defaultAudience, hideAudience, profileDefault, wallHost]);

  const persistDraft = useCallback(
    (doc: MentionDoc, files: ComposerDraftAttachment[]) => {
      if (doc.text.trim() || files.length > 0) {
        writeComposerDraft(scope, { doc, attachments: files });
        return;
      }
      clearComposerDraft(scope);
    },
    [scope],
  );

  const onDocChange = useCallback(
    (doc: MentionDoc) => {
      docRef.current = doc;
      const next = doc.text.trim().length > 0;
      setHasText((current) => (current === next ? current : next));
      persistDraft(doc, attachments);
    },
    [attachments, persistDraft],
  );

  useEffect(() => {
    persistDraft(docRef.current, attachments);
  }, [attachments, persistDraft]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    for (const item of attachments) {
      if (item.kind !== 'gif' && !item.remoteUrl && item.progress == null && !item.error) {
        void uploadQueued(item);
      }
    }
    // Resume a stored draft once; new attaches call uploadQueued themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function cancelCollapse() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  function scheduleCollapse() {
    cancelCollapse();
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (holdFocus.current || gifOpen) {
        holdFocus.current = false;
        return;
      }
      setExpanded(false);
    }, 160);
  }

  useEffect(() => () => cancelCollapse(), []);

  function clearDraft() {
    docRef.current = { text: '', chips: [] };
    setHasText(false);
    setAttachments([]);
    setGifOpen(false);
    setFieldKey((value) => value + 1);
    setExpanded(!idleUntilFocus);
    clearComposerDraft(scope);
  }

  function discardDraft() {
    const run = () => clearDraft();
    if (attachments.length === 0) {
      run();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(copy('post.discardConfirm'))) {
        run();
      }
      return;
    }
    Alert.alert(copy('post.discardConfirm'), undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: copy('post.discard'), style: 'destructive', onPress: run },
    ]);
  }

  const busy = Boolean(submitting || uploading);
  const uploadsReady = attachments.every(
    (item) => item.kind === 'gif' || Boolean(item.remoteUrl),
  );
  const canPost =
    Boolean(hasText || attachments.length > 0 || quote || attachedChallenge) &&
    uploadsReady &&
    (audience !== 'specific' || audienceUserIds.length > 0);

  function addAttachment(attachment: Omit<Attachment, 'id'>) {
    if (attachments.length >= 4) {
      Alert.alert('That’s a full blob', 'You can attach up to 4 things per post.');
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: Attachment =
      attachment.kind === 'gif'
        ? { ...attachment, id, remoteUrl: attachment.uri, progress: 100 }
        : { ...attachment, id, progress: 0, remoteUrl: null };
    setAttachments((current) => [...current, next]);
    if (next.kind !== 'gif') {
      void uploadQueued(next);
    }
  }

  async function uploadQueued(attachment: Attachment) {
    if (!user) {
      return;
    }
    if (attachment.kind === 'video') {
      void posterUriFor(attachment.uri).then((poster) => {
        if (!poster) {
          return;
        }
        setAttachments((current) =>
          current.map((item) => (item.id === attachment.id ? { ...item, poster } : item)),
        );
      });
    }
    setUploading(true);
    try {
      const url = await uploadPostAttachment({
        uri: attachment.uri,
        userId: user.id,
        fileStem: `${Date.now()}-${attachment.id}`,
        mimeType: attachment.mimeType ?? attachment.blob?.type,
        blob: attachment.blob,
        originalName: attachment.name,
        onProgress: (event) => {
          const percent = uploadProgressPercent(event.loaded, event.total);
          setAttachments((current) =>
            current.map((item) =>
              item.id === attachment.id ? { ...item, progress: percent ?? item.progress ?? 0, error: null } : item,
            ),
          );
        },
      });
      setAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id ? { ...item, remoteUrl: url, progress: 100, error: null } : item,
        ),
      );
    } catch {
      Alert.alert(copy('error.uploadRetry'));
      setAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id ? { ...item, error: copy('error.uploadRetry'), progress: null } : item,
        ),
      );
    } finally {
      setUploading(false);
    }
  }

  async function pickGallery() {
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('library');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      const uri = localUriFromPickerAsset(asset);
      if (!uri) {
        Alert.alert(copy('error.usePhotoOrVideo'));
        return;
      }
      const kind = asGalleryMedia({
        mimeType: asset.mimeType ?? asset.file?.type,
        fileName: asset.fileName,
        uri,
        type: asset.type,
      });
      if (!kind) {
        Alert.alert(copy('error.usePhotoOrVideo'));
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        Alert.alert('That file is too large', 'Keep it under 50 MB.');
        return;
      }
      addAttachment({
        uri,
        kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.fileName ?? (kind === 'video' ? 'Video' : 'Photo'),
        size: asset.fileSize ?? null,
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function handleSubmit() {
    if (busy || !canPost) {
      return;
    }
    if (!user) {
      Alert.alert('Sign in first', 'You need to be signed in to post.');
      return;
    }
    setUploading(true);
    try {
      const mediaUrls: string[] = [];
      if (!quote) {
        for (const attachment of attachments) {
          if (attachment.kind === 'gif') {
            mediaUrls.push(attachment.uri);
            continue;
          }
          if (!attachment.remoteUrl) {
            throw new Error(copy('error.uploadRetry'));
          }
          mediaUrls.push(attachment.remoteUrl);
        }
      }
      if (wallHost?.id) {
        const allowed = await supabase.rpc('can_post_on_profile', { p_host_id: wallHost.id });
        if (allowed.error || allowed.data !== true) {
          throw new Error(copy('wall.closed'));
        }
      }
      const latest = fieldRef.current?.getDoc() ?? docRef.current;
      const postAudience = hideAudience ? 'public' : audience;
      await onSubmit({
        content: latest.text.trim(),
        mediaUrls,
        audience: postAudience,
        audienceUserIds: postAudience === 'specific' ? audienceUserIds : [],
        mentionedUserIds: latest.chips
          .filter((chip) => (chip.kind ?? 'user') === 'user')
          .map((chip) => chip.userId),
        mentionedEntities: latest.chips.map((chip) => ({
          kind: chip.kind ?? 'user',
          id: chip.userId,
        })),
        wallHostId: wallHost?.id ?? null,
        quotedPostId: quote?.postId ?? null,
        quoteSnapshot: quote?.snapshot ?? null,
        challengeId: attachedChallenge?.id ?? null,
      });
      clearDraft();
      setAudience(hideAudience ? 'public' : wallHost ? 'public' : profileDefault);
      setAudienceUserIds([]);
    } catch (error) {
      if (getErrorMessage(error) === copy('wall.closed')) {
        throw error;
      }
      Alert.alert('Couldn’t post that', getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card
      padded={false}
      style={{
        paddingHorizontal: idleUntilFocus ? 10 : 12,
        paddingVertical: idleUntilFocus ? 8 : 10,
        borderRadius: 20,
        overflow: 'visible',
      }}>
      <View className="flex-row items-end" style={{ gap: 8, overflow: 'visible' }}>
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name ?? profile?.username ?? user?.email}
          size={36}
          radius={14}
        />
        <View
          className="min-w-0 flex-1 flex-row items-start"
          style={{
            backgroundColor: THEME.background,
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 18,
            paddingLeft: 12,
            paddingRight: 4,
            paddingVertical: 4,
            minHeight: 40,
            alignItems: 'flex-start',
            overflow: 'visible',
          }}>
          <View className="min-w-0 flex-1" style={{ minHeight: 32, justifyContent: 'flex-end', overflow: 'visible' }}>
            {wallHost ? (
              <AppText className="mb-0.5 text-[11px] font-semibold" style={{ color: THEME.accent }}>
                {copy('wall.onHost', asCopyTone(profile?.motivation_tone), { name: wallHostLabel({ display_name: wallHost.name, username: wallHost.username }) })}
              </AppText>
            ) : null}
            <MentionField
              key={fieldKey}
              ref={fieldRef}
              placeholder={resolvedPlaceholder}
              autoFocus={autoFocus}
              initialText={docRef.current.text}
              compact
              collapsed={!expanded && !hasText}
              pickerPlacement="flow"
              audience={audience}
              audienceUserIds={audienceUserIds}
              onChange={onDocChange}
              onFocus={() => {
                cancelCollapse();
                setExpanded(true);
              }}
              onBlur={tall ? undefined : scheduleCollapse}
              onSubmit={() => void handleSubmit()}
              accessibilityLabel="Write a post"
            />
          </View>
          {hasText || attachments.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy('post.discard')}
              onPress={discardDraft}
              onPressIn={() => {
                holdFocus.current = true;
                cancelCollapse();
              }}
              hitSlop={6}
              className="items-center justify-center"
              style={{ width: 36, height: 44 }}>
              <AppText className="text-[16px] font-semibold" style={{ color: THEME.textMuted }}>
                ✕
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Posting…' : 'Post'}
            onPress={() => void handleSubmit()}
            onPressIn={() => {
              holdFocus.current = true;
              cancelCollapse();
            }}
            disabled={!canPost || busy}
            className="items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: canPost && !busy ? THEME.primary : THEME.border,
            }}>
            {busy ? (
              <ActivityIndicator color={THEME.primaryForeground} size="small" />
            ) : (
            <Glyph
              name={GLYPH.send}
              color={canPost && !busy ? THEME.primaryForeground : THEME.textMuted}
              size={18}
            />
            )}
          </Pressable>
        </View>
      </View>

      {expanded ? (
      <View className="mt-1 flex-row items-center" style={{ gap: 2, minHeight: 44, zIndex: 2 }}>
        <ComposerIcon
          glyph={GLYPH.camera}
          label="Camera"
          onPressIn={() => {
            holdFocus.current = true;
            cancelCollapse();
          }}
          onPress={() => router.push(captureHref('post', 'photo'))}
        />
        <ComposerIcon
          glyph={GLYPH.album}
          label="Gallery"
          onPressIn={() => {
            holdFocus.current = true;
            cancelCollapse();
          }}
          onPress={() => void pickGallery()}
        />
        <ComposerIcon
          mark="GIF"
          label="GIF"
          onPressIn={() => {
            holdFocus.current = true;
            cancelCollapse();
          }}
          onPress={() => setGifOpen((open) => !open)}
        />
        {hideAudience ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Audience"
            onPress={() =>
              social?.openAudience({
                audience,
                audienceUserIds,
                allowPublic,
                onSave: (next, ids) => {
                  setAudience(next);
                  setAudienceUserIds(ids);
                },
              })
            }
            hitSlop={4}
            onPressIn={() => {
              holdFocus.current = true;
              cancelCollapse();
            }}
            className="items-center justify-center"
            style={{ width: 44, height: 44 }}>
            <AudienceIconButton audience={audience} />
          </Pressable>
        )}
      </View>
      ) : null}

      {gifOpen ? (
        <GifPicker
          visible
          onClose={() => setGifOpen(false)}
          onPick={(url) => {
            addAttachment({ uri: url, kind: 'gif', name: 'GIF' });
            setGifOpen(false);
          }}
        />
      ) : null}

      {quote ? (
        <View className="mt-2" pointerEvents="none">
          <QuoteEmbed snapshot={quote.snapshot} audience={quote.audience ?? quote.snapshot.audience} />
        </View>
      ) : null}

      {attachedChallenge && !quote ? (
        <View className="mt-2" pointerEvents="none">
          <ChallengeInviteCard
            challenge={attachedChallenge}
            theme={attachedChallenge.is_official ? 'official' : 'user'}
            context="lobby"
          />
        </View>
      ) : null}

      {attachments.length > 0 && !quote ? (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() =>
                setAttachments((current) => current.filter((item) => item.id !== attachment.id))
              }
              onRetry={() => void uploadQueued(attachment)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function keepFocusProps() {
  if (Platform.OS !== 'web') {
    return null;
  }
  return {
    onMouseDown: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
  };
}

function ComposerIcon({
  glyph,
  mark,
  label,
  onPress,
  onPressIn,
}: {
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
  mark?: string;
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={onPressIn}
      hitSlop={4}
      className="items-center justify-center"
      style={{ width: 44, height: 44 }}
      {...keepFocusProps()}>
      {mark ? (
        <AppText className="text-[11px] font-extrabold" style={{ color: THEME.textMuted }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={THEME.textMuted} size={18} />
      ) : null}
    </Pressable>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: Attachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const poster = attachment.poster || (attachment.kind !== 'video' ? attachment.uri : null);
  const uploading = !attachment.remoteUrl && attachment.kind !== 'gif' && !attachment.error;
  const percent = typeof attachment.progress === 'number' ? attachment.progress : null;
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 12,
        backgroundColor: THEME.background,
        maxWidth: '100%',
      }}>
      <View style={{ width: 96, height: 72, backgroundColor: THEME.primary }}>
        {poster ? (
          <Image source={{ uri: poster }} style={{ width: 96, height: 72 }} contentFit="cover" />
        ) : (
          <View className="items-center justify-center" style={{ width: 96, height: 72 }}>
            <Glyph name={GLYPH.play} color="#fff" size={22} />
          </View>
        )}
        {uploading ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              top: 0,
              backgroundColor: 'rgba(16,19,18,0.45)',
              justifyContent: 'flex-end',
              padding: 6,
            }}>
            <View className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }}>
              <View
                className="h-full rounded-full"
                style={{
                  width: percent == null ? '40%' : `${Math.max(6, percent)}%`,
                  backgroundColor: THEME.accentBright,
                }}
              />
            </View>
            <AppText className="mt-1 text-[10px] font-bold" style={{ color: '#fff' }}>
              {percent == null ? 'Uploading…' : `${percent}%`}
            </AppText>
          </View>
        ) : null}
        {attachment.error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry upload"
            onPress={onRetry}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(16,19,18,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}>
            <AppText className="text-center text-[10px] font-bold" style={{ color: '#fff' }}>
              Try again
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        onPress={onRemove}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <AppText className="text-[14px] font-semibold text-muted">×</AppText>
      </Pressable>
    </View>
  );
}
