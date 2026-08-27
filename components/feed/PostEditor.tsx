import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { applyEditedPostToFeeds, useEditPost } from '@/hooks/usePostEdit';
import { useQueryClient } from '@tanstack/react-query';
import { requiredChallengeProofs } from '@/lib/challenges';
import { saveCapturedProofLocally } from '@/lib/checkin';
import { isCheckinPost } from '@/lib/checkinPost';
import { proofDisplayName, uniqueProofUrls, type ChallengeProofPart } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import {
  hiddenUrlsFromParts,
  isHiddenMedia,
  isPersistedMediaUrl,
  postEditUnchanged,
  requiredProofUrls,
} from '@/lib/postEdit';
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
  const queryClient = useQueryClient();
  const originalHidden = uniqueProofUrls(post.hidden_media_urls ?? []);
  const originalCaption = post.content ?? '';
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
  const [mediaUrls, setMediaUrls] = useState(uniqueProofUrls(post.media_urls ?? []));
  const [hidden, setHidden] = useState(uniqueProofUrls(post.hidden_media_urls ?? []));
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const mergedHidden = useRef(false);

  useEffect(() => {
    if (!checkinRow.data || mergedHidden.current) {
      return;
    }
    mergedHidden.current = true;
    setHidden((current) => uniqueProofUrls([...current, ...hiddenUrlsFromParts(checkinRow.data)]));
  }, [checkinRow.data]);

  const extras = mediaUrls.filter((url) => !Object.values(required).some((urls) => urls.includes(url)));

  function patchHidden(nextHidden: string[]) {
    setHidden(nextHidden);
    applyEditedPostToFeeds(queryClient, {
      id: post.id,
      hidden_media_urls: nextHidden,
    });
  }

  function hideUrl(url: string) {
    console.log('[blob:hide]', url);
    if (!isPersistedMediaUrl(url)) {
      onToast?.(copy('post.savePhotoFirst'));
      return;
    }
    patchHidden(uniqueProofUrls([...hidden, url]));
  }

  function unhideUrl(url: string) {
    patchHidden(hidden.filter((item) => !isHiddenMedia(item, [url]) && item !== url));
  }

  function closeWithoutSave() {
    applyEditedPostToFeeds(queryClient, {
      id: post.id,
      content: originalCaption,
      hidden_media_urls: originalHidden,
      edited_at: post.edited_at,
    });
    onClose();
  }

  function removeRegular(url: string) {
    setMediaUrls((current) => current.filter((item) => item !== url));
    setHidden((current) => current.filter((item) => item !== url));
  }

  async function pickMedia(proofId?: string) {
    try {
      const camera = proofId
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.9,
          });
      if (camera.canceled || !camera.assets[0]?.uri) {
        return;
      }
      const asset = camera.assets[0];
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
        hidden,
        originalHidden: uniqueProofUrls([
          ...(post.hidden_media_urls ?? []),
          ...hiddenUrlsFromParts(checkinRow.data),
        ]),
      });
    if (unchanged) {
      onToast?.(copy('post.noChanges'));
      onClose();
      return;
    }
    setBusy(true);
    try {
      const replacements: Record<string, string> = {};
      const uploaded: string[] = [];
      for (const draft of drafts) {
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
        hiddenMediaUrls: hidden,
        proofReplacements: replacements,
        checkinId: post.checkin_id,
      });
      if (__DEV__) {
        console.log('[blob:edit-save]', {
          postId: post.id,
          hidden,
          hiddenCount: hidden.length,
          payloadChars: JSON.stringify({ caption, nextMedia, hidden }).length,
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
          <Input
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            multiline
            placeholder="Write a caption…"
          />
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
                        <EditorFrame uri={url} hidden={!draft && isHiddenMedia(url, hidden)} />
                        <View className="flex-row" style={{ gap: 8 }}>
                          <Button
                            title="Replace"
                            variant="outline"
                            size="sm"
                            onPress={() => void pickMedia(proof.id)}
                          />
                          <HideControl
                            url={url}
                            hidden={!draft && isHiddenMedia(url, hidden)}
                            blocked={
                              draft
                                ? copy('post.savePhotoFirst')
                                : !isPersistedMediaUrl(url)
                                  ? copy('post.replaceFirst')
                                  : null
                            }
                            onPress={() => {
                              if (draft || !isPersistedMediaUrl(url)) {
                                onToast?.(draft ? copy('post.savePhotoFirst') : copy('post.replaceFirst'));
                                return;
                              }
                              if (isHiddenMedia(url, hidden)) {
                                unhideUrl(url);
                                return;
                              }
                              hideUrl(url);
                            }}
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
              <EditorFrame uri={url} hidden={isHiddenMedia(url, hidden)} />
              <View className="flex-row" style={{ gap: 8 }}>
                {checkin ? (
                  <HideControl
                    url={url}
                    hidden={isHiddenMedia(url, hidden)}
                    blocked={!isPersistedMediaUrl(url) ? copy('post.savePhotoFirst') : null}
                    onPress={() =>
                      isHiddenMedia(url, hidden) ? unhideUrl(url) : hideUrl(url)
                    }
                  />
                ) : (
                  <Button title="Remove" variant="ghost" size="sm" onPress={() => removeRegular(url)} />
                )}
              </View>
            </View>
          ))}
          {drafts
            .filter((row) => !row.proofId)
            .map((row) => (
              <View key={row.uri} style={{ gap: 8 }}>
                <EditorFrame uri={row.uri} />
                <HideControl
                  url={row.uri}
                  blocked={copy('post.savePhotoFirst')}
                  onPress={() => onToast?.(copy('post.savePhotoFirst'))}
                />
              </View>
            ))}
          <Button
            title={checkin ? 'Add extra photo' : 'Add photo'}
            variant="outline"
            onPress={() => void pickMedia()}
          />
          <Button title="Save" loading={busy || edit.isPending} onPress={() => void onSave()} />
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function HideControl({
  url,
  hidden,
  blocked,
  onPress,
}: {
  url: string;
  hidden?: boolean;
  blocked?: string | null;
  onPress: () => void;
}) {
  const title = hidden ? copy('post.unhide') : 'Hide';
  const faded = Boolean(blocked && !hidden);
  return (
    <WebTapButton
      accessibilityLabel={`${title} ${url}`}
      onPress={() => {
        console.log('[blob:hide]', url);
        onPress();
      }}
      style={{
        height: 44,
        minWidth: 72,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: THEME.radiusSm,
        borderWidth: 1,
        borderColor: faded ? THEME.border : THEME.primary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: faded ? 0.38 : 1,
      }}>
      <AppText className="text-[14px] font-semibold" style={{ color: faded ? THEME.textMuted : THEME.primary }}>
        {title}
      </AppText>
    </WebTapButton>
  );
}

function EditorFrame({
  uri,
  hidden,
}: {
  uri: string;
  hidden?: boolean;
}) {
  return (
    <View
      style={{
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: THEME.background,
      }}>
      <Image
        source={{ uri }}
        style={{
          width: '100%',
          height: '100%',
          ...(hidden && Platform.OS === 'web' ? ({ filter: 'blur(16px)' } as object) : null),
        }}
        contentFit="contain"
        blurRadius={hidden ? 36 : 0}
      />
      {hidden ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.28)',
            ...(Platform.OS === 'web'
              ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
              : null),
          }}>
          <View
            style={{
              backgroundColor: 'rgba(16,19,18,0.72)',
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.surface }}>
              {copy('post.hiddenByAuthor')}
            </AppText>
          </View>
        </View>
      ) : null}
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
