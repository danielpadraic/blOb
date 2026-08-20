import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';

import { MentionField } from '@/components/feed/MentionField';
import { AudienceIconButton } from '@/components/feed/AudienceSheet';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { ChallengeFeedCard } from '@/components/feed/ChallengeFeedCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useSocialSheetsOptional } from '@/components/social/SocialSheets';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { asCopyTone, copy } from '@/lib/copy';
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
import { handleEnterToSubmit } from '@/utils/keyboard';
import { isHttpUrl, mediaKind } from '@/utils/media';
import { uploadPostMedia } from '@/utils/upload';

type Attachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'file' | 'link';
  mimeType?: string | null;
  name?: string;
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
  const [doc, setDoc] = useState<MentionDoc>({ text: initialText ?? '', chips: [] });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
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
      addAttachment({
        uri: asset.uri,
        kind: 'file',
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.name,
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that file', getErrorMessage(error));
    }
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!isHttpUrl(url)) {
      Alert.alert('Needs a real link', 'Paste a full http(s) URL.');
      return;
    }
    addAttachment({ uri: url, kind: 'link', name: url });
    setLinkDraft('');
    setLinkOpen(false);
  }

  function onOther() {
    Alert.alert('Add something', 'A file or a link — your call.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Link', onPress: () => setLinkOpen(true) },
      { text: 'File', onPress: () => void pickFile() },
    ]);
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
          if (attachment.kind === 'link') {
            mediaUrls.push(attachment.uri);
            continue;
          }
          const url = await uploadPostMedia({
            uri: attachment.uri,
            userId: user.id,
            fileStem: `${Date.now()}-${index}`,
            mimeType: attachment.mimeType ?? attachment.blob?.type,
            blob: attachment.blob,
          });
          mediaUrls.push(url);
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
      <View className="flex-row items-center gap-2.5">
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name ?? profile?.username ?? user?.email}
          size={36}
          radius={14}
        />
        <View
          className="min-w-0 flex-1 flex-row items-center"
          style={{
            backgroundColor: THEME.background,
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 18,
            paddingLeft: 10,
            paddingRight: 4,
            minHeight: 40,
          }}>
          <View className="min-w-0 flex-1">
            {wallHost ? (
              <AppText className="mb-0.5 text-[11px] font-semibold" style={{ color: THEME.accent }}>
                {copy('wall.onHost', 'neutral', { name: wallHostLabel({ display_name: wallHost.name, username: wallHost.username }) })}
              </AppText>
            ) : null}
            <MentionField
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
          {hideAudience ? null : (
            <AudienceIconButton
              audience={audience}
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
            />
          )}
          {!quote ? (
            <>
              <ComposerIcon
                glyph={GLYPH.camera}
                label="Photo"
                onPress={() => router.push(captureHref('post', 'photo'))}
              />
              <ComposerIcon
                glyph={GLYPH.video}
                label="Video"
                onPress={() => router.push(captureHref('post', 'video'))}
              />
              <ComposerIcon glyph={GLYPH.attach} label="Other" onPress={onOther} />
            </>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post"
          onPress={() => void handleSubmit()}
          disabled={!canPost || busy}
          className="items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: canPost && !busy ? THEME.primary : THEME.border,
          }}>
          <Glyph
            name={GLYPH.send}
            color={canPost && !busy ? THEME.primaryForeground : THEME.textMuted}
            size={16}
          />
        </Pressable>
      </View>

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

      {linkOpen ? (
        <View
          className="mt-3 px-1 pb-1 pt-3"
          style={{
            borderTopWidth: 1,
            borderTopColor: THEME.border,
          }}>
            <AppText className="mb-3 text-[16px] font-bold text-charcoal">Paste a link</AppText>
            <Input
              value={linkDraft}
              onChangeText={setLinkDraft}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onKeyPress={(event) => handleEnterToSubmit(event, addLink)}
            />
            <View className="mt-3 flex-row gap-2">
              <View className="flex-1">
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setLinkOpen(false)} />
              </View>
              <View className="flex-1">
                <Button title="Add link" size="sm" onPress={addLink} disabled={!linkDraft.trim()} />
              </View>
            </View>
        </View>
      ) : null}
    </Card>
  );
}

function ComposerIcon({
  glyph,
  label,
  onPress,
}: {
  glyph: (typeof GLYPH)[keyof typeof GLYPH];
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
      style={{ width: 28, height: 32 }}>
      <Glyph name={glyph} color={THEME.textMuted} size={15} />
    </Pressable>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const kind = attachment.kind === 'link' ? 'link' : mediaKind(attachment.uri);
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 10,
        backgroundColor: THEME.background,
      }}>
      {kind === 'image' || attachment.kind === 'photo' ? (
        <Image source={{ uri: attachment.uri }} style={{ width: 36, height: 36 }} contentFit="cover" />
      ) : (
        <View className="h-9 items-center justify-center px-2">
          <AppText className="text-[11px] font-semibold text-charcoal">
            {attachment.kind === 'video' ? 'Video' : attachment.kind === 'link' ? 'Link' : 'File'}
          </AppText>
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={onRemove} className="px-2">
        <AppText className="text-[12px] font-semibold text-muted">×</AppText>
      </Pressable>
    </View>
  );
}
