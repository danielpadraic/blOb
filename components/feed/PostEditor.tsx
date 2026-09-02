import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

import { GifPicker } from '@/components/feed/GifPicker';
import { MentionField } from '@/components/feed/MentionField';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { applyEditedPostToFeeds, useEditPost, useHidePostFromHome } from '@/hooks/usePostEdit';
import { useQueryClient } from '@tanstack/react-query';
import { requiredChallengeProofs } from '@/lib/challenges';
import { saveCapturedProofLocally } from '@/lib/checkin';
import { isCheckinPost } from '@/lib/checkinPost';
import { proofDisplayName, uniqueProofUrls, type ChallengeProofPart } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import type { MentionChip } from '@/lib/mentions';
import { canRemoveCheckinExtra, isPersistedMediaUrl, postEditUnchanged, requiredProofUrls } from '@/lib/postEdit';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';
import { supabase } from '@/lib/supabase';

type DraftAsset = {
  uri: string;
  mimeType?: string | null;
  captured?: boolean;
  proofId?: string;
};

export function PostEditor({
  post,
  onClose,
  onSaved,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onSaved?: () => void;
  onToast?: (message: string) => void;
}) {
  const { user } = useAuth();
  const edit = useEditPost();
  const hideHome = useHidePostFromHome();
  const queryClient = useQueryClient();
  const originalCaption = post.content ?? '';
  const originalMedia = uniqueProofUrls(post.media_urls ?? []);
  const checkin = isCheckinPost(post);
  const challenge = useChallenge(checkin && post.challenge_id ? post.challenge_id : undefined);
  const checkinRow = useQuery({
    queryKey: ['edit-checkin', post.checkin_id],
    enabled: Boolean(post.checkin_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_checkins')
        .select('proof_parts')
        .eq('id', post.checkin_id as string)
        .maybeSingle();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return (data?.proof_parts ?? {}) as Record<string, ChallengeProofPart>;
    },
  });
  const proofs = requiredChallengeProofs(challenge.data);
  const required = useMemo(
    () => requiredProofUrls(proofs, checkinRow.data),
    [checkinRow.data, proofs],
  );
  const [caption, setCaption] = useState(post.content ?? '');
  const [mediaUrls, setMediaUrls] = useState(originalMedia);
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [gifOpen, setGifOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mentionChips = useMemo<MentionChip[]>(
    () =>
      (post.mentions ?? []).map((row) => ({
        userId: row.userId,
        username: row.username,
        label: row.displayName?.trim() || row.username,
        kind: row.kind,
      })),
    [post.mentions],
  );
  const [originalHiddenFromHome] = useState(Boolean(post.hidden_from_home));
  const [hiddenFromHome, setHiddenFromHome] = useState(originalHiddenFromHome);

  const extras = mediaUrls.filter((url) => !Object.values(required).some((urls) => urls.includes(url)));

  function closeWithoutSave() {
    applyEditedPostToFeeds(queryClient, {
      id: post.id,
      content: originalCaption,
      media_urls: originalMedia,
      hidden_from_home: originalHiddenFromHome,
      edited_at: post.edited_at,
    });
    onClose();
  }

  function toggleHiddenFromHome() {
    const next = !hiddenFromHome;
    setHiddenFromHome(next);
    applyEditedPostToFeeds(queryClient, {
      id: post.id,
      hidden_from_home: next,
    });
  }

  function removeExtra(url: string) {
    if (checkin && !canRemoveCheckinExtra({ url, mediaUrls, required })) {
      onToast?.(copy('post.keepOneProof'));
      return;
    }
    setMediaUrls((current) => current.filter((item) => item !== url));
  }

  async function attachPicked(asset: ImagePicker.ImagePickerAsset, proofId?: string) {
    if (!asset.uri) {
      return;
    }
    if (proofId) {
      void saveCapturedProofLocally({ uri: asset.uri });
    }
    setDrafts((current) => [
      ...current.filter((row) => row.proofId !== proofId),
      {
        uri: asset.uri,
        mimeType: asset.mimeType,
        captured: Boolean(proofId),
        proofId,
      },
    ]);
  }

  async function pickCamera(proofId?: string) {
    const permission = await ensureCameraPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('camera');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      await attachPicked(result.assets[0], proofId);
    } catch (error) {
      onToast?.(getErrorMessage(error));
    }
  }

  async function pickGallery(proofId?: string) {
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
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      await attachPicked(result.assets[0], proofId);
    } catch (error) {
      onToast?.(getErrorMessage(error));
    }
  }

  async function onSave() {
    if (!user?.id || busy || edit.isPending) {
      return;
    }
    const unchanged =
      drafts.length === 0 &&
      postEditUnchanged({
        caption,
        originalCaption: post.content ?? '',
        mediaUrls,
        originalMediaUrls: post.media_urls ?? [],
        hidden: [],
        originalHidden: [],
        hiddenFromHome,
        originalHiddenFromHome,
      });
    if (unchanged) {
      onToast?.(copy('post.noChanges'));
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (hiddenFromHome !== originalHiddenFromHome) {
        await hideHome.mutateAsync({ postId: post.id, hidden: hiddenFromHome });
      }
      const mediaChanged =
        drafts.length > 0 ||
        caption.trim() !== (post.content ?? '').trim() ||
        mediaUrls.join('|') !== originalMedia.join('|');
      if (mediaChanged) {
        const replacements: Record<string, string> = {};
        const uploaded: string[] = [];
        for (const draft of drafts) {
          if (isPersistedMediaUrl(draft.uri) && !draft.proofId) {
            uploaded.push(draft.uri);
            continue;
          }
          const remote = await uploadPostAttachment({
            uri: draft.uri,
            userId: user.id,
            fileStem: draft.proofId ? `proof-${draft.proofId}` : 'post',
            mimeType: draft.mimeType,
          });
          uploaded.push(remote);
          if (draft.proofId) {
            replacements[draft.proofId] = remote;
          }
        }
        const nextMedia = uniqueProofUrls([...mediaUrls, ...uploaded]);
        await edit.mutateAsync({
          postId: post.id,
          caption,
          mediaUrls: nextMedia,
          hiddenMediaUrls: [],
          proofReplacements: replacements,
          checkinId: post.checkin_id,
        });
      }
      onSaved?.();
      onClose();
    } catch {
      onToast?.(copy('post.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChromeOverlay visible onClose={closeWithoutSave} align="end" zIndex={70}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '92%',
          paddingBottom: 20,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Pressable accessibilityRole="button" onPress={closeWithoutSave} hitSlop={8}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.textMuted }}>
              Cancel
            </AppText>
          </Pressable>
          <AppText className="text-[16px] font-extrabold text-charcoal">{copy('post.edit')}</AppText>
          <View style={{ width: 56 }} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 16 }}>
          <View style={{ gap: 6 }}>
            <AppText className="text-[13px] font-semibold text-charcoal">Caption</AppText>
            <MentionField
              placeholder="Write a caption…"
              initialText={post.content ?? ''}
              initialChips={mentionChips}
              audience={post.audience ?? 'public'}
              audienceUserIds={post.audience_user_ids ?? []}
              onChange={(doc) => setCaption(doc.text)}
              accessibilityLabel="Caption"
            />
          </View>
          <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
            {hiddenFromHome ? copy('post.hiddenFromHome') : copy('post.hideFromHome')}
          </AppText>
          <WebTapButton
            accessibilityLabel={hiddenFromHome ? copy('post.unhideOnHome') : copy('post.hideFromHome')}
            onPress={toggleHiddenFromHome}
            style={{
              height: 44,
              minHeight: 44,
              minWidth: 72,
              paddingHorizontal: 12,
              borderRadius: THEME.radiusSm,
              borderWidth: 1,
              borderColor: THEME.primary,
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'flex-start',
            }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.primary }}>
              {hiddenFromHome ? copy('post.unhideOnHome') : copy('post.hideFromHome')}
            </AppText>
          </WebTapButton>
          {checkin
            ? proofs.map((proof) => {
                const urls = required[proof.id] ?? [];
                const draft = drafts.find((row) => row.proofId === proof.id);
                if (urls.length === 0 && !draft) {
                  return null;
                }
                const shown = draft ? [draft.uri] : urls;
                return (
                  <View key={proof.id} style={{ gap: 8 }}>
                    <AppText className="text-[13px] font-semibold text-charcoal">
                      {proofDisplayName(proof)}
                    </AppText>
                    {shown.map((url) => (
                      <View key={url} style={{ gap: 8 }}>
                        <EditorFrame uri={url} />
                        <View className="flex-row" style={{ gap: 8 }}>
                          <Button
                            title="Replace"
                            variant="outline"
                            size="sm"
                            onPress={() => void pickCamera(proof.id)}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })
            : null}
          {(checkin ? extras : mediaUrls).map((url) => (
            <View key={url} style={{ gap: 8 }}>
              <EditorFrame uri={url} />
              <View className="flex-row" style={{ gap: 8 }}>
                <RemoveControl
                  disabled={checkin && !canRemoveCheckinExtra({ url, mediaUrls, required })}
                  onPress={() => removeExtra(url)}
                  onBlocked={() => onToast?.(copy('post.keepOneProof'))}
                />
              </View>
            </View>
          ))}
          {drafts
            .filter((row) => !row.proofId)
            .map((row) => (
              <View key={row.uri} style={{ gap: 8 }}>
                <EditorFrame uri={row.uri} />
                <RemoveControl
                  onPress={() => setDrafts((current) => current.filter((item) => item.uri !== row.uri))}
                />
              </View>
            ))}
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button title="GIF" variant="outline" size="sm" onPress={() => setGifOpen((open) => !open)} />
            <Button title="Camera" variant="outline" size="sm" onPress={() => void pickCamera()} />
            <Button title="Gallery" variant="outline" size="sm" onPress={() => void pickGallery()} />
          </View>
          {gifOpen ? (
            <GifPicker
              visible
              onClose={() => setGifOpen(false)}
              onPick={(url) => {
                setDrafts((current) => [...current, { uri: url }]);
                setGifOpen(false);
              }}
            />
          ) : null}
          <Button title="Save" loading={busy || edit.isPending} onPress={() => void onSave()} />
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function RemoveControl({
  disabled,
  onPress,
  onBlocked,
}: {
  disabled?: boolean;
  onPress: () => void;
  onBlocked?: () => void;
}) {
  return (
    <WebTapButton
      accessibilityLabel="Remove"
      onPress={() => {
        if (disabled) {
          onBlocked?.();
          return;
        }
        onPress();
      }}
      style={{
        height: 44,
        minWidth: 72,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: THEME.radiusSm,
        borderWidth: 1,
        borderColor: disabled ? THEME.border : THEME.primary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.38 : 1,
      }}>
      <AppText className="text-[14px] font-semibold" style={{ color: disabled ? THEME.textMuted : THEME.primary }}>
        Remove
      </AppText>
    </WebTapButton>
  );
}

function EditorFrame({ uri }: { uri: string }) {
  return (
    <View
      style={{
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: THEME.background,
      }}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
    </View>
  );
}

export function PostEditHistory({
  rows,
  onClose,
}: {
  rows: { caption: string; created_at: string }[];
  onClose: () => void;
}) {
  return (
    <ChromeOverlay visible onClose={onClose} align="end" zIndex={70}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '70%',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
          ...themeShadow('card'),
        }}>
        <AppText className="mb-3 text-[16px] font-extrabold text-charcoal">{copy('post.editHistory')}</AppText>
        <ScrollView>
          {rows.length === 0 ? (
            <AppText className="text-[14px]" style={{ color: THEME.textMuted }}>
              No earlier captions.
            </AppText>
          ) : (
            rows.map((row) => (
              <View
                key={row.created_at}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: THEME.border,
                  paddingVertical: 12,
                }}>
                <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
                  {new Date(row.created_at).toLocaleString()}
                </AppText>
                <AppText className="mt-1 text-[15px] text-charcoal">
                  {row.caption.trim() || '(no caption)'}
                </AppText>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
