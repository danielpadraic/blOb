import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';

import { MentionField } from '@/components/feed/MentionField';
import { QuoteEmbed } from '@/components/feed/QuoteEmbed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useFriends } from '@/hooks/useSocial';
import { asCopyTone, copy } from '@/lib/copy';
import {
  DEFAULT_POST_AUDIENCE,
  POST_AUDIENCE_OPTIONS,
  type PostAudience,
} from '@/lib/postAudience';
import { captureHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
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
  quote?: { postId: string; snapshot: QuoteSnapshot; audience?: string | null } | null;
  wallHost?: { id: string; name?: string | null; username?: string | null } | null;
  onSubmit: (input: ComposeInput) => Promise<unknown> | void;
};

export function Composer({
  placeholder,
  submitting,
  autoFocus,
  quote,
  wallHost,
  onSubmit,
}: ComposerProps) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const resolvedPlaceholder = placeholder ?? copy('home.composer', asCopyTone(profile?.motivation_tone));
  const router = useRouter();
  const friends = useFriends();
  const [doc, setDoc] = useState<MentionDoc>({ text: '', chips: [] });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [audience, setAudience] = useState<PostAudience>(wallHost ? 'public' : DEFAULT_POST_AUDIENCE);
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([]);

  const busy = Boolean(submitting || uploading);
  const canPost =
    Boolean(doc.text.trim() || attachments.length > 0 || quote) &&
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
      await onSubmit({
        content: doc.text.trim(),
        mediaUrls,
        audience,
        audienceUserIds: audience === 'specific' ? audienceUserIds : [],
        mentionedUserIds: doc.chips.map((chip) => chip.userId),
        wallHostId: wallHost?.id ?? null,
        quotedPostId: quote?.postId ?? null,
        quoteSnapshot: quote?.snapshot ?? null,
      });
      setDoc({ text: '', chips: [] });
      setAttachments([]);
      setAudience(wallHost ? 'public' : DEFAULT_POST_AUDIENCE);
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
        <View className="min-w-0 flex-1">
          {wallHost ? (
            <AppText className="mb-1 text-[12px] font-semibold" style={{ color: THEME.accent }}>
              {copy('wall.onHost', 'neutral', { name: wallHostLabel({ display_name: wallHost.name, username: wallHost.username }) })}
            </AppText>
          ) : null}
          <MentionField
            placeholder={resolvedPlaceholder}
            autoFocus={autoFocus}
            audience={audience}
            audienceUserIds={audienceUserIds}
            onChange={setDoc}
            onSubmit={() => void handleSubmit()}
            accessibilityLabel="Write a post"
          />
        </View>
        <Button
          title="Post"
          size="sm"
          onPress={() => void handleSubmit()}
          loading={busy}
          disabled={!canPost}
          style={{ height: 36, minWidth: 64, borderRadius: 10 }}
        />
      </View>

      {quote ? (
        <View className="mt-2" pointerEvents="none">
          <QuoteEmbed snapshot={quote.snapshot} audience={quote.audience ?? quote.snapshot.audience} />
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

      <View
        className="mt-2"
        style={{ borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 8 }}>
        <SegmentedControl
          value={audience}
          options={POST_AUDIENCE_OPTIONS}
          onChange={setAudience}
          accessibilityLabel="Post audience"
        />
        {audience === 'specific' ? (
          <View className="mt-2 gap-1.5">
            <AppText className="text-[12px] text-muted">Who can see this</AppText>
            {(friends.data ?? []).length === 0 ? (
              <AppText className="text-[12px] text-muted">Add friends first.</AppText>
            ) : (
              <ChipRow>
                {(friends.data ?? []).map((row) => {
                  const id = row.profile?.id;
                  if (!id) {
                    return null;
                  }
                  const selected = audienceUserIds.includes(id);
                  return (
                    <Chip
                      key={id}
                      label={personDisplayName(row.profile)}
                      selected={selected}
                      onPress={() =>
                        setAudienceUserIds((current) =>
                          selected ? current.filter((item) => item !== id) : [...current, id],
                        )
                      }
                    />
                  );
                })}
              </ChipRow>
            )}
          </View>
        ) : null}
      </View>

      {!quote ? (
      <View
        className="mt-2 flex-row items-center"
        style={{ borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 8 }}>
        <AttachButton glyph="📷" label="Photo" onPress={() => router.push(captureHref('post', 'photo'))} />
        <View style={{ width: 1, height: 16, backgroundColor: THEME.border }} />
        <AttachButton glyph="🎥" label="Video" onPress={() => router.push(captureHref('post', 'video'))} />
        <View style={{ width: 1, height: 16, backgroundColor: THEME.border }} />
        <AttachButton glyph="📎" label="Other" onPress={onOther} />
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

function AttachButton({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="h-8 flex-1 flex-row items-center justify-center rounded-full px-1.5">
      <AppText className="text-[13px]">{glyph}</AppText>
      <AppText className="ml-1 text-[12px] font-semibold text-muted">{label}</AppText>
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
