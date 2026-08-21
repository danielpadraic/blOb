import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { MentionField } from '@/components/feed/MentionField';
import { AudienceIconButton } from '@/components/feed/AudienceSheet';
import { GifPicker } from '@/components/feed/GifPicker';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ChallengeFeedCard } from '@/components/feed/ChallengeFeedCard';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
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
import { mediaKind } from '@/utils/media';
import { uploadPostAttachment } from '@/utils/upload';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Attachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'file' | 'link' | 'gif';
  mimeType?: string | null;
  name?: string;
  size?: number | null;
  blob?: Blob | null;
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
  onSubmit,
}: ComposerProps) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const resolvedPlaceholder = placeholder ?? copy('home.composer', asCopyTone(profile?.motivation_tone));
  const router = useRouter();
  const social = useSocialSheetsOptional();
  const profileDefault = asDefaultPostAudience(profile?.default_post_audience);
  const [fieldKey, setFieldKey] = useState(0);
  const [doc, setDoc] = useState<MentionDoc>({ text: initialText ?? '', chips: [] });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const allowPublic = !audienceOptions || audienceOptions.some((item) => item.value === 'public');
  const [audience, setAudience] = useState<PostAudience>(
    hideAudience ? 'public' : (defaultAudience ?? (wallHost ? 'public' : profileDefault)),
  );
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (hideAudience || defaultAudience || wallHost) {
      return;
    }
    setAudience(profileDefault);
  }, [defaultAudience, hideAudience, profileDefault, wallHost]);

  const busy = Boolean(submitting || uploading);
  const canPost =
    Boolean(doc.text.trim() || attachments.length > 0 || quote || attachedChallenge) &&
    (audience !== 'specific' || audienceUserIds.length > 0);

  function addAttachment(attachment: Omit<Attachment, 'id'>) {
    setAttachments((current) => {
      if (current.length >= 4) {
        Alert.alert('That’s a full blob', 'You can attach up to 4 things per post.');
        return current;
      }
      return [...current, { ...attachment, id: `${Date.now()}-${current.length}` }];
    });
  }

  async function pickPhoto() {
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
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      addAttachment({
        uri: asset.uri,
        kind: 'photo',
        mimeType: asset.mimeType,
        name: asset.fileName ?? 'Photo',
        size: asset.fileSize ?? null,
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that photo', getErrorMessage(error));
    }
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      const asset = result.assets[0];
      if (typeof asset.size === 'number' && asset.size > MAX_FILE_BYTES) {
        Alert.alert('That file is too large', 'Keep it under 50 MB.');
        return;
      }
      addAttachment({
        uri: asset.uri,
        kind: 'file',
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.name,
        size: asset.size ?? null,
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that file', getErrorMessage(error));
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
        for (const [index, attachment] of attachments.entries()) {
          if (attachment.kind === 'link' || attachment.kind === 'gif') {
            mediaUrls.push(attachment.uri);
            continue;
          }
          try {
            const url = await uploadPostAttachment({
              uri: attachment.uri,
              userId: user.id,
              fileStem: `${Date.now()}-${index}`,
              mimeType: attachment.mimeType ?? attachment.blob?.type,
              blob: attachment.blob,
              originalName: attachment.name,
            });
            mediaUrls.push(url);
          } catch {
            throw new Error(copy('error.composerUpload'));
          }
        }
      }
      if (wallHost?.id) {
        const allowed = await supabase.rpc('can_post_on_profile', { p_host_id: wallHost.id });
        if (allowed.error || allowed.data !== true) {
          throw new Error(copy('wall.closed'));
        }
      }
      const postAudience = hideAudience ? 'public' : audience;
      await onSubmit({
        content: doc.text.trim(),
        mediaUrls,
        audience: postAudience,
        audienceUserIds: postAudience === 'specific' ? audienceUserIds : [],
        mentionedUserIds: doc.chips.map((chip) => chip.userId),
        wallHostId: wallHost?.id ?? null,
        quotedPostId: quote?.postId ?? null,
        quoteSnapshot: quote?.snapshot ?? null,
        challengeId: attachedChallenge?.id ?? null,
      });
      setDoc({ text: '', chips: [] });
      setAttachments([]);
      setGifOpen(false);
      setFieldKey((value) => value + 1);
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
    <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20 }}>
      <View className="flex-row items-end" style={{ gap: 2 }}>
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name ?? profile?.username ?? user?.email}
          size={36}
          radius={14}
        />
        <View
          className="min-w-0 flex-1"
          style={{
            backgroundColor: THEME.background,
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 18,
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 44,
            justifyContent: 'center',
          }}>
          {wallHost ? (
            <AppText className="mb-0.5 text-[11px] font-semibold" style={{ color: THEME.accent }}>
              {copy('wall.onHost', 'neutral', { name: wallHostLabel({ display_name: wallHost.name, username: wallHost.username }) })}
            </AppText>
          ) : null}
          <MentionField
            key={fieldKey}
            placeholder={resolvedPlaceholder}
            autoFocus={autoFocus}
            compact
            audience={audience}
            audienceUserIds={audienceUserIds}
            onChange={setDoc}
            onSubmit={() => void handleSubmit()}
            accessibilityLabel="Write a post"
          />
        </View>
        {!quote ? (
          <>
            <ComposerIcon
              glyph={GLYPH.camera}
              label="Camera"
              onPress={() => router.push(captureHref('post', 'photo'))}
            />
            <ComposerIcon glyph={GLYPH.album} label="Photo library" onPress={() => void pickPhoto()} />
            <ComposerIcon glyph={GLYPH.attach} label="File" onPress={() => void pickFile()} />
            <ComposerIcon mark="GIF" label="GIF" onPress={() => setGifOpen((open) => !open)} />
          </>
        ) : null}
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
            className="items-center justify-center"
            style={{ width: 44, height: 44 }}>
            <AudienceIconButton audience={audience} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post"
          onPress={() => void handleSubmit()}
          disabled={!canPost || busy}
          className="items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: canPost && !busy ? THEME.primary : THEME.border,
          }}>
          <Glyph
            name={GLYPH.send}
            color={canPost && !busy ? THEME.primaryForeground : THEME.textMuted}
            size={18}
          />
        </Pressable>
      </View>

      {gifOpen && !quote ? (
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
          <ChallengeFeedCard challenge={attachedChallenge} />
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
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ComposerIcon({
  glyph,
  mark,
  label,
  onPress,
}: {
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
  mark?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="items-center justify-center"
      style={{ width: 44, height: 44 }}>
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

function formatSize(bytes?: number | null): string | null {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  if (n < 1024) {
    return `${Math.round(n)} B`;
  }
  if (n < 1024 * 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const kind = attachment.kind === 'link' ? 'link' : attachment.kind === 'gif' ? 'image' : mediaKind(attachment.uri);
  const size = formatSize(attachment.size);
  const fileLabel = [attachment.name || 'File', size].filter(Boolean).join(' · ');
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 10,
        backgroundColor: THEME.background,
        maxWidth: '100%',
      }}>
      {kind === 'image' || attachment.kind === 'photo' || attachment.kind === 'gif' ? (
        <Image source={{ uri: attachment.uri }} style={{ width: 44, height: 44 }} contentFit="cover" />
      ) : (
        <View className="min-h-[44px] justify-center px-2.5" style={{ maxWidth: 180 }}>
          <AppText className="text-[12px] font-semibold text-charcoal" numberOfLines={1}>
            {attachment.kind === 'video' ? 'Video' : attachment.kind === 'link' ? 'Link' : fileLabel}
          </AppText>
        </View>
      )}
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
