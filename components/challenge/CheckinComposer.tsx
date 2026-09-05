import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckinShareTo } from '@/components/challenge/CheckinShareTo';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { GifPicker } from '@/components/feed/GifPicker';
import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import {
  KeyboardField,
  KeyboardFormContext,
  useKeyboardOverlap,
} from '@/components/ui/KeyboardFormShell';
import {
  CHECKIN_PHOTO_CAP,
  excludeRequiredSlotMedia,
  proofDisplayName,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import {
  CHECKIN_PROOF_CAPTION_MAX,
  clampProofCaption,
  proofCaptionCounter,
  proofCaptionHelper,
  proofCaptionPlaceholder,
} from '@/lib/checkinShare';
import { copy } from '@/lib/copy';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import type { MentionDoc } from '@/lib/mentions';
import { saveCapturedProofLocally } from '@/lib/checkin/saveProofLocal';
import { SaveCaptureHint } from '@/components/capture/SaveCaptureHint';
import { tabBarLift, THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { asGalleryMedia } from '@/utils/media';

export type CheckinExtra = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'gif';
  mimeType?: string | null;
  name?: string;
  blob?: Blob | null;
  remoteUrl?: string;
};

export type CheckinSlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
  fromLibrary?: boolean;
  /** The blOb workout card is rasterizing for this slot. */
  building?: boolean;
};

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const STRIP = 56;

type ReviewPage =
  | { key: string; kind: 'proof'; proof: ChallengeProof; uri: string; label: string }
  | { key: string; kind: 'extra'; extra: CheckinExtra; uri: string; label: string };

type CheckinComposerProps = {
  proofs: ChallengeProof[];
  drafts: Record<string, CheckinSlotDraft>;
  extras: CheckinExtra[];
  initialCaption?: string;
  audienceUserIds?: string[];
  allReady: boolean;
  busy?: boolean;
  canSend: boolean;
  blockedHint?: string;
  stillNeeded?: string;
  onClose: () => void;
  onRetake: (proof: ChallengeProof) => void;
  onOpenGallery: (proof: ChallengeProof) => void;
  onAddProof: (proof: ChallengeProof) => void;
  onRemoveProof: (proof: ChallengeProof) => void;
  onExtrasChange: (extras: CheckinExtra[]) => void;
  onCaptionChange: (doc: MentionDoc) => void;
  proofCaptions?: Record<string, string>;
  onProofCaptionChange?: (proofId: string, caption: string) => void;
  lobbyName?: string;
  lobbyLocked?: boolean;
  shareHome?: boolean;
  onShareHomeChange?: (value: boolean) => void;
  shareWave?: boolean;
  onShareWaveChange?: (value: boolean) => void;
  onSend: () => void;
  accessory?: ReactNode;
  /** Per-slot content rendered under the hero, keyed by proof id. Used for read workout stats. */
  proofAccessories?: Record<string, ReactNode>;
  dueLine?: ReactNode;
};

export function CheckinComposer({
  proofs,
  drafts,
  extras,
  initialCaption,
  audienceUserIds = [],
  allReady,
  busy,
  canSend,
  blockedHint,
  stillNeeded,
  onClose,
  onRetake,
  onOpenGallery,
  onAddProof,
  onRemoveProof: _onRemoveProof,
  onExtrasChange,
  onCaptionChange,
  proofCaptions = {},
  proofAccessories,
  onProofCaptionChange,
  lobbyName: _lobbyName,
  lobbyLocked,
  shareHome = true,
  onShareHomeChange,
  shareWave = false,
  onShareWaveChange,
  onSend,
  accessory,
  dueLine,
}: CheckinComposerProps) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const pagerRef = useRef<FlatList<ReviewPage>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const lastFieldNode = useRef<View | null>(null);
  const overlapRef = useRef(0);
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  overlapRef.current = keyboardOverlap;
  const keyboardOpen = keyboardOverlap > 0;
  const [footerH, setFooterH] = useState(64);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const pageWidth = Math.max(windowWidth, 1);
  // Keyboard on web shrinks window height. If the hero resizes, the Note field blurs and the keyboard loops.
  const [shellHeight] = useState(() => Math.max(windowHeight, 1));
  const heroHeight = Math.max(Math.min(Math.round(shellHeight * 0.42), 360), 220);
  const [gifOpen, setGifOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const chromePad = tabBarLift(insets.bottom, 'sticky');
  /**
   * Read through refs so this callback keeps one identity. Closing over footerH meant a growing
   * multiline field rebuilt it mid-keystroke, and the effect below then scrolled while the user
   * was typing, which dismisses the iOS keyboard.
   */
  const footerRef = useRef(footerH);
  footerRef.current = footerH;
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;
  const scrollFieldIntoView = useCallback((node: View) => {
    if (Platform.OS === 'web') {
      return;
    }
    lastFieldNode.current = node;
    const run = () => {
      node.measureInWindow((_x, y, _w, h) => {
        const windowH = windowHeightRef.current;
        const reserved = footerRef.current + overlapRef.current + 24;
        const visibleBottom = windowH - reserved;
        const fieldBottom = y + h;
        let delta = 0;
        if (fieldBottom > visibleBottom) {
          delta = fieldBottom - visibleBottom;
        } else if (y < 24 && overlapRef.current <= 0) {
          delta = y - 24;
        }
        if (delta !== 0) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollY.current + delta),
            animated: true,
          });
        }
      });
    };
    requestAnimationFrame(() => {
      setTimeout(run, Platform.OS === 'android' ? 80 : 40);
    });
  }, []);

  // Only the keyboard opening or closing may scroll. Typing must never move the list.
  useEffect(() => {
    if (Platform.OS === 'web' || keyboardOverlap <= 0 || !lastFieldNode.current) {
      return;
    }
    scrollFieldIntoView(lastFieldNode.current);
  }, [keyboardOverlap, scrollFieldIntoView]);

  const onDocChange = useCallback(
    (doc: MentionDoc) => {
      onCaptionChange(doc);
    },
    [onCaptionChange],
  );

  const pages: ReviewPage[] = [
    ...proofs.flatMap((proof): ReviewPage[] => {
      const uri = drafts[proof.id]?.uri;
      if (!uri || uri.startsWith('health:')) {
        return [];
      }
      return [{ key: `proof-${proof.id}`, kind: 'proof', proof, uri, label: proofDisplayName(proof) }];
    }),
    ...extras.map((item) => ({
      key: `extra-${item.id}`,
      kind: 'extra' as const,
      extra: item,
      uri: item.uri,
      label: item.name ?? 'Extra',
    })),
  ];
  const current = pages[Math.min(pageIndex, Math.max(pages.length - 1, 0))] ?? null;
  const nextProof = proofs.find((proof) => {
    const draft = drafts[proof.id];
    return !draft?.uri && !draft?.text;
  });

  useEffect(() => {
    if (pageIndex > pages.length - 1) {
      setPageIndex(Math.max(pages.length - 1, 0));
    }
  }, [pageIndex, pages.length]);

  function goToPage(index: number) {
    const next = Math.max(0, Math.min(index, pages.length - 1));
    setPageIndex(next);
    if (pages.length > 0) {
      pagerRef.current?.scrollToIndex({ index: next, animated: true });
    }
  }

  const photoCount =
    proofs.filter((proof) => {
      const uri = drafts[proof.id]?.uri;
      return Boolean(uri && !uri.startsWith('health:'));
    }).length + extras.filter((item) => item.kind === 'photo' || item.kind === 'gif').length;
  const remainingSlots = Math.max(0, CHECKIN_PHOTO_CAP - photoCount);
  const canAddPhoto = remainingSlots > 0 && !busy;

  function extraPhotoSheet() {
    if (!canAddPhoto) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
    Alert.alert('Photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => void pickCamera('photo') },
      { text: 'Gallery', onPress: () => void pickGallery('photo') },
    ]);
  }

  function addExtra(attachment: Omit<CheckinExtra, 'id'>) {
    if (photoCount >= CHECKIN_PHOTO_CAP && attachment.kind !== 'video') {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
    const next = excludeRequiredSlotMedia(
      [...extras, { ...attachment, id: `${Date.now()}-${extras.length}` }],
      proofs.map((proof) => drafts[proof.id]?.uri),
    );
    if (next.length === extras.length) {
      return;
    }
    onExtrasChange(next);
  }

  function addMany(attachments: Omit<CheckinExtra, 'id'>[]) {
    const room = Math.max(0, CHECKIN_PHOTO_CAP - photoCount);
    const photos = attachments.filter((item) => item.kind !== 'video');
    const videos = attachments.filter((item) => item.kind === 'video');
    const accepted = [...photos.slice(0, room), ...videos];
    if (photos.length > room) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
    }
    if (accepted.length === 0) {
      return;
    }
    const next = excludeRequiredSlotMedia(
      [
        ...extras,
        ...accepted.map((attachment, index) => ({
          ...attachment,
          id: `${Date.now()}-${extras.length + index}`,
        })),
      ],
      proofs.map((proof) => drafts[proof.id]?.uri),
    );
    if (next.length === extras.length) {
      return;
    }
    onExtrasChange(next);
  }

  async function pickGallery(requested: 'photo' | 'video' | 'any' = 'photo') {
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
        mediaTypes: requested === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        allowsMultipleSelection: requested !== 'video' && remainingSlots > 1,
        selectionLimit: requested === 'video' ? 1 : Math.max(remainingSlots, 1),
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) {
        return;
      }
      // Lock: an empty gallery pick says so. It is never a silent no-op.
      if (result.assets.length === 0) {
        Alert.alert(copy('checkin.pickEmpty'));
        return;
      }
      const next: Omit<CheckinExtra, 'id'>[] = [];
      for (const asset of result.assets) {
        if (!asset.uri) {
          continue;
        }
        const kind = asGalleryMedia({
          mimeType: asset.mimeType ?? asset.file?.type,
          fileName: asset.fileName,
          uri: asset.uri,
          type: asset.type,
        });
        if (!kind) {
          continue;
        }
        if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
          Alert.alert('That file is too large', 'Keep it under 50 MB.');
          continue;
        }
        next.push({
          uri: asset.uri,
          kind,
          mimeType: asset.mimeType ?? asset.file?.type,
          name: 'Extra',
          blob: asset.file ?? null,
        });
      }
      if (next.length === 0) {
        Alert.alert('Use a photo or video.');
        return;
      }
      addMany(next);
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function pickCamera(kind: 'photo' | 'video' = 'photo') {
    const permission = await ensureCameraPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('camera');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
        { text: 'Gallery', onPress: () => void pickGallery(kind) },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: kind === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      void saveCapturedProofLocally({ uri: asset.uri, fromLibrary: false });
      addExtra({
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: 'Extra',
        blob: asset.file ?? null,
      });
    } catch (error) {
      if (Platform.OS === 'web') {
        await pickGallery(kind);
        return;
      }
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  function replaceExtra(extra: CheckinExtra, next: Omit<CheckinExtra, 'id'>) {
    onExtrasChange(extras.map((item) => (item.id === extra.id ? { ...item, ...next, id: extra.id } : item)));
  }

  async function retakeExtra(extra: CheckinExtra) {
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
        mediaTypes: extra.kind === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      void saveCapturedProofLocally({ uri: asset.uri, fromLibrary: false });
      replaceExtra(extra, {
        uri: asset.uri,
        kind: extra.kind === 'gif' ? 'photo' : extra.kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: extra.name ?? 'Extra',
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function galleryReplaceExtra(extra: CheckinExtra) {
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
        mediaTypes: extra.kind === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) {
        return;
      }
      // Lock: an empty gallery pick says so. It is never a silent no-op.
      if (!result.assets[0]?.uri) {
        Alert.alert(copy('checkin.pickEmpty'));
        return;
      }
      const asset = result.assets[0];
      replaceExtra(extra, {
        uri: asset.uri,
        kind: extra.kind === 'gif' ? 'photo' : extra.kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: extra.name ?? 'Extra',
        blob: asset.file ?? null,
        remoteUrl: undefined,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  function requiredSlotsFilled(): boolean {
    return proofs.every((proof) => {
      const draft = drafts[proof.id];
      return Boolean(draft?.uri || draft?.text);
    });
  }

  function canRemovePage(page: ReviewPage): boolean {
    if (page.kind === 'proof') {
      return false;
    }
    return requiredSlotsFilled();
  }

  function confirmRemove(page: ReviewPage) {
    if (!canRemovePage(page)) {
      return;
    }
    Alert.alert('Remove this photo from the check-in?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          onExtrasChange(extras.filter((item) => item.id !== page.extra.id));
        },
      },
    ]);
  }

  function sendPress() {
    if (busy) {
      return;
    }
    onSend();
  }

  // A fresh object here re-rendered every keyboard-aware field on each keystroke.
  const formApi = useMemo(
    () => ({
      scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
      scrollFieldIntoView,
    }),
    [scrollFieldIntoView],
  );

  return (
    <KeyboardFormContext.Provider value={formApi}>
    <KeyboardAvoidingView
      className="flex-1"
      style={{
        flex: 1,
        backgroundColor: THEME.background,
      }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: Math.max(insets.top, 8) + 4,
          left: 12,
          zIndex: 4,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(16,19,18,0.45)',
        }}>
        <AppText className="text-[22px] font-semibold" style={{ color: '#fff' }}>
          ×
        </AppText>
      </Pressable>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: THEME.background }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: footerH + 16,
        }}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}>
      <View style={{ height: heroHeight, backgroundColor: THEME.primary }}>
        {pages.length > 0 ? (
          <FlatList
            ref={pagerRef}
            data={pages}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.key}
            style={{ height: heroHeight }}
            getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
            onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
              setPageIndex(Math.max(0, Math.min(next, pages.length - 1)));
            }}
            renderItem={({ item }) => (
              <View style={{ width: pageWidth, height: heroHeight }}>
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: pageWidth, height: heroHeight }}
                  contentFit="contain"
                  accessibilityLabel={item.label}
                />
                {item.kind === 'proof' && proofCaptions[item.proof.id]?.trim() ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 16,
                      right: 16,
                      bottom: 64,
                    }}>
                    <AppText
                      className="text-[15px] leading-5"
                      style={{ color: '#fff' }}
                      numberOfLines={2}
                      ellipsizeMode="tail">
                      {proofCaptions[item.proof.id]}
                    </AppText>
                  </View>
                ) : null}
              </View>
            )}
          />
        ) : (
          <View
            className="items-center justify-center px-8"
            style={{
              height: heroHeight,
              backgroundColor: accessory ? THEME.background : THEME.primary,
            }}>
            {accessory ? null : (
              <AppText className="text-center text-[15px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Honor check-in. Post is optional.
              </AppText>
            )}
          </View>
        )}

        {current ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 12,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}>
            <OverlayChip
              label="Retake"
              onPress={() => {
                if (current.kind === 'proof') {
                  onRetake(current.proof);
                } else {
                  void retakeExtra(current.extra);
                }
              }}
            />
            {canRemovePage(current) ? (
              <OverlayChip label="Remove" onPress={() => confirmRemove(current)} />
            ) : null}
            <OverlayChip
              label="Gallery"
              onPress={() => {
                if (current.kind === 'proof') {
                  onOpenGallery(current.proof);
                } else {
                  void galleryReplaceExtra(current.extra);
                }
              }}
            />
            {nextProof ? (
              <OverlayChip label="Add more proof" onPress={() => onAddProof(nextProof)} />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Read numbers for the slot on screen, directly under its photo. */}
      {current?.kind === 'proof' && proofAccessories?.[current.proof.id] ? (
        <View style={{ paddingTop: 8, paddingHorizontal: 12, backgroundColor: THEME.background }}>
          {proofAccessories[current.proof.id]}
        </View>
      ) : null}

      {pages.length > 1 || nextProof || extras.length > 0 ? (
        <View style={{ paddingTop: 8, paddingHorizontal: 12, backgroundColor: THEME.background }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {proofs.map((proof) => {
              const uri = drafts[proof.id]?.uri;
              const health = uri?.startsWith('health:');
              const filled = Boolean(uri || drafts[proof.id]?.text);
              if (!filled) {
                return null;
              }
              return (
                <Pressable
                  key={proof.id}
                  accessibilityRole="button"
                  accessibilityLabel={proofDisplayName(proof)}
                  onPress={() => {
                    const index = pages.findIndex((page) => page.kind === 'proof' && page.proof.id === proof.id);
                    if (index >= 0) {
                      goToPage(index);
                    }
                  }}
                  style={{
                    width: STRIP,
                    height: STRIP,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    backgroundColor: THEME.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {uri && !health ? (
                    <Image source={{ uri }} style={{ width: STRIP, height: STRIP }} contentFit="cover" />
                  ) : (
                    <AppText className="px-0.5 text-center text-[9px] font-bold text-muted" numberOfLines={2}>
                      {/* Never a bare tile: say the card is rendering. */}
                      {drafts[proof.id]?.building
                        ? 'Building proof…'
                        : health
                          ? 'Health'
                          : proofDisplayName(proof)}
                    </AppText>
                  )}
                </Pressable>
              );
            })}
            {extras.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel="Extra"
                onPress={() => {
                  const start = pages.findIndex((page) => page.kind === 'extra' && page.extra.id === item.id);
                  if (start >= 0) {
                    goToPage(start);
                  }
                }}
                onLongPress={() => {
                  const page = pages.find((row) => row.kind === 'extra' && row.extra.id === item.id);
                  if (page) {
                    confirmRemove(page);
                  }
                }}
                style={{
                  width: STRIP,
                  height: STRIP,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                }}>
                {item.kind === 'video' ? (
                  <View className="h-full w-full items-center justify-center" style={{ backgroundColor: THEME.primary }}>
                    <Glyph name={GLYPH.play} color="#fff" size={16} />
                  </View>
                ) : (
                  <Image source={{ uri: item.uri }} style={{ width: STRIP, height: STRIP }} contentFit="cover" />
                )}
              </Pressable>
            ))}
            {nextProof ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add proof"
                onPress={() => onAddProof(nextProof)}
                style={{
                  width: STRIP,
                  height: STRIP,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText className="text-[22px] font-semibold" style={{ color: THEME.accent, lineHeight: 24 }}>
                  +
                </AppText>
              </Pressable>
            ) : null}
          </ScrollView>
          {/* Required proof must stay readable: the list wraps instead of clipping to one line. */}
          {stillNeeded ? (
            <AppText className="mt-1 text-[12px] leading-4 text-muted">
              Still needed: {stillNeeded}
            </AppText>
          ) : null}
        </View>
      ) : stillNeeded ? (
        <AppText className="px-4 pt-2 text-[12px] leading-4 text-muted">
          Still needed: {stillNeeded}
        </AppText>
      ) : null}

      {current &&
      !current.uri.startsWith('health:') &&
      (current.kind === 'extra'
        ? current.extra.kind !== 'gif' && !current.extra.remoteUrl
        : !drafts[current.proof.id]?.fromLibrary) ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <SaveCaptureHint
            uri={current.uri}
            blob={current.kind === 'extra' ? current.extra.blob : undefined}
            mimeType={current.kind === 'extra' ? current.extra.mimeType : drafts[current.proof.id]?.mimeType}
            mediaType={current.kind === 'extra' && current.extra.kind === 'video' ? 'video' : 'image'}
            fromLibrary={current.kind === 'proof' ? drafts[current.proof.id]?.fromLibrary : false}
          />
        </View>
      ) : null}

      {dueLine ? <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>{dueLine}</View> : null}
      {accessory ? <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>{accessory}</View> : null}

      {proofs.some((proof) => {
        const uri = drafts[proof.id]?.uri;
        return Boolean(uri && !uri.startsWith('health:'));
      }) ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
          {proofs.map((proof) => {
            const uri = drafts[proof.id]?.uri;
            if (!uri || uri.startsWith('health:')) {
              return null;
            }
            const value = proofCaptions[proof.id] ?? '';
            const counter = proofCaptionCounter(value);
            const placeholder = proofCaptionPlaceholder(proof);
            const helper = proofCaptionHelper(proof);
            return (
              <KeyboardField key={proof.id}>
                <View style={{ paddingTop: 8 }}>
                  {helper ? (
                    <AppText
                      className="mb-1 text-[12px] leading-4"
                      style={{ color: THEME.textMuted }}>
                      {helper}
                    </AppText>
                  ) : null}
                  <Input
                    grow
                    growMaxLines={3}
                    maxLength={CHECKIN_PROOF_CAPTION_MAX}
                    placeholder={placeholder}
                    value={value}
                    onChangeText={(text) =>
                      onProofCaptionChange?.(proof.id, clampProofCaption(text))
                    }
                    hint={counter ?? undefined}
                    accessibilityLabel={placeholder}
                  />
                </View>
              </KeyboardField>
            );
          })}
        </View>
      ) : null}

      <CheckinShareTo
        hideHome={lobbyLocked}
        shareHome={shareHome}
        onShareHomeChange={onShareHomeChange ?? (() => undefined)}
        shareWave={shareWave}
        onShareWaveChange={onShareWaveChange ?? (() => undefined)}
      />

      <View className="mt-1 flex-row items-center" style={{ minHeight: 44, gap: 2, paddingHorizontal: 8 }}>
        <ComposerIcon
          glyph={GLYPH.camera}
          label="Camera"
          dimmed={!canAddPhoto}
          onPress={extraPhotoSheet}
        />
        <ComposerIcon
          glyph={GLYPH.album}
          label="Gallery"
          dimmed={!canAddPhoto}
          onPress={() => void pickGallery('photo')}
        />
        <ComposerIcon mark="GIF" label="GIF" onPress={() => setGifOpen((open) => !open)} />
        <ComposerIcon
          mark="+"
          label="Add proof"
          dimmed={!nextProof || Boolean(busy)}
          onPress={() => {
            if (nextProof) {
              onAddProof(nextProof);
            }
          }}
        />
      </View>

      {gifOpen ? (
        <View style={{ paddingHorizontal: 12 }}>
          <GifPicker
            visible
            onClose={() => setGifOpen(false)}
            onPick={(url) => {
              addExtra({ uri: url, kind: 'gif', name: 'GIF' });
              setGifOpen(false);
            }}
          />
        </View>
      ) : null}
      </ScrollView>
      <View
        onLayout={(event) => setFooterH(Math.max(64, event.nativeEvent.layout.height))}
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: createStickyFooterPad(keyboardOpen, chromePad),
          backgroundColor: THEME.background,
          borderTopWidth: 1,
          borderTopColor: THEME.border,
        }}>
        <KeyboardField>
          <View
            className="flex-row items-end"
            style={{
              backgroundColor: THEME.background,
              borderWidth: 1,
              borderColor: THEME.border,
              borderRadius: 18,
              paddingLeft: 12,
              paddingRight: 4,
              paddingVertical: 4,
              minHeight: 40,
            }}>
            <View className="min-w-0 flex-1" style={{ minHeight: 32, justifyContent: 'flex-end' }}>
              <MentionField
                ref={fieldRef}
                compact
                initialText={initialCaption}
                placeholder={copy('checkin.post')}
                audience="specific"
                audienceUserIds={audienceUserIds}
                pickerPlacement="above"
                onChange={onDocChange}
                onSubmit={sendPress}
                accessibilityLabel={copy('checkin.post')}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityHint={!canSend && !busy && !allReady && blockedHint ? `Still needed: ${blockedHint}` : undefined}
              accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
              disabled={Boolean(busy)}
              onPress={sendPress}
              className="items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: canSend && !busy ? THEME.primary : THEME.border,
              }}>
              <Glyph
                name={GLYPH.send}
                color={canSend && !busy ? THEME.primaryForeground : THEME.textMuted}
                size={18}
              />
            </Pressable>
          </View>
        </KeyboardField>
      </View>
    </KeyboardAvoidingView>
    </KeyboardFormContext.Provider>
  );
}

function OverlayChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(16,19,18,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText className="text-[13px] font-semibold" style={{ color: '#fff' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ComposerIcon({
  glyph,
  mark,
  label,
  onPress,
  dimmed,
}: {
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
  mark?: string;
  label: string;
  onPress: () => void;
  dimmed?: boolean;
}) {
  const color = dimmed ? THEME.textMuted : THEME.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="items-center justify-center"
      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, opacity: dimmed ? 0.45 : 1 }}>
      {mark ? (
        <AppText className="text-[13px] font-extrabold" style={{ color }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={color} size={18} />
      ) : null}
    </Pressable>
  );
}
