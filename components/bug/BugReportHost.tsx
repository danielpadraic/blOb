import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChallengeMenuPopover,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { submitBugReport, type BugReportAttachment } from '@/lib/bugReports';
import { getLastCapture } from '@/lib/lastCapture';
import { ADMIN_HREF } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';
import { ensureLibraryPermission, openAppSettings, permissionCopy } from '@/lib/mediaPermissions';
import { asGalleryMedia } from '@/utils/media';
import { getErrorMessage } from '@/utils/errors';

export type { MenuAnchor as BugReportMenuAnchor };

type BugReportContextValue = {
  open: () => void;
  openMenu: (anchor: MenuAnchor, options?: { admin?: boolean }) => void;
};

const BugReportContext = createContext<BugReportContextValue | null>(null);

const EMPTY: BugReportContextValue = {
  open: () => {},
  openMenu: () => {},
};

export function useBugReport(): BugReportContextValue {
  return useContext(BugReportContext) ?? EMPTY;
}

export function BugReportHost({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; admin: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<BugReportAttachment | null>(null);
  const [route, setRoute] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastCapture = open ? getLastCapture() : null;

  const show = useCallback(() => {
    setMenu(null);
    setRoute(pathname);
    setMessage('');
    setAttachment(null);
    setError(null);
    setSending(false);
    setOpen(true);
  }, [pathname]);

  const openMenu = useCallback((anchor: MenuAnchor, options?: { admin?: boolean }) => {
    setMenu({ anchor, admin: Boolean(options?.admin) });
  }, []);

  const close = useCallback(() => {
    if (sending) {
      return;
    }
    setOpen(false);
  }, [sending]);

  const value = useMemo(() => ({ open: show, openMenu }), [openMenu, show]);

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
      const kind = asGalleryMedia({
        mimeType: asset.mimeType ?? asset.file?.type,
        fileName: asset.fileName,
        uri: asset.uri,
        type: asset.type,
      });
      if (kind !== 'photo') {
        setError('Use a JPEG, PNG, WebP, or HEIC screenshot.');
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > 8 * 1024 * 1024) {
        setError('That screenshot is too large. Keep it under 8 MB.');
        return;
      }
      setError(null);
      setAttachment({
        uri: asset.uri,
        mimeType: asset.mimeType ?? asset.file?.type,
        blob: asset.file ?? null,
        size: asset.fileSize ?? null,
      });
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  function useLastCapture() {
    const next = getLastCapture();
    if (!next) {
      setError('No recent capture.');
      return;
    }
    setError(null);
    setAttachment(next);
  }

  async function send() {
    const text = message.trim();
    if (!text || sending) {
      if (!text) {
        setError('Tell Bob what happened.');
      }
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitBugReport({ message: text, route, attachment });
      setOpen(false);
      setToast('Got it. Bob will look.');
      setTimeout(() => setToast((current) => (current === 'Got it. Bob will look.' ? null : current)), 2400);
    } catch {
      setError('Couldn’t send. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <BugReportContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 300, elevation: 300 }}>
        <ChallengeMenuPopover
          anchor={menu?.anchor ?? null}
          onClose={() => setMenu(null)}
          actions={[
            {
              key: 'report',
              label: 'Report a problem',
              onPress: show,
            },
            ...(menu?.admin
              ? [
                  {
                    key: 'admin',
                    label: 'Admin',
                    onPress: () => router.push(ADMIN_HREF),
                  },
                ]
              : []),
          ]}
        />
        <ChromeOverlay visible={open} onClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            className="px-5 pb-8 pt-6"
            style={{
              backgroundColor: THEME.background,
              borderTopLeftRadius: THEME.radiusLg,
              borderTopRightRadius: THEME.radiusLg,
              paddingBottom: Math.max(insets.bottom, 24),
              ...themeShadow('bar'),
            }}
            onPress={(event) => event.stopPropagation()}>
            <AppText className="text-[22px] font-extrabold text-charcoal">Report a problem</AppText>
            <AppText className="mt-1 text-[13px] text-muted">What happened?</AppText>
            <View className="mt-3">
              <Input
                value={message}
                onChangeText={setMessage}
                placeholder="What went wrong?"
                multiline
                textAlignVertical="top"
                style={{ minHeight: 120 }}
              />
            </View>
            {attachment ? (
              <View className="mt-3 flex-row items-center gap-3">
                <Image
                  source={{ uri: attachment.uri }}
                  style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: THEME.surface2 }}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAttachment(null)}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                    Remove
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Button title="Gallery" variant="outline" size="sm" onPress={() => void pickGallery()} />
                {lastCapture ? (
                  <Button title="Last capture" variant="outline" size="sm" onPress={useLastCapture} />
                ) : null}
              </View>
            )}
            {error ? (
              <AppText className="mt-3 text-[13px]" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}
            <View className="mt-4 gap-2">
              <Button title="Send" size="lg" loading={sending} onPress={() => void send()} />
              <Button title="Cancel" variant="ghost" onPress={close} disabled={sending} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </ChromeOverlay>
      {toast ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 28,
            zIndex: 80,
            alignItems: 'center',
          }}>
          <View
            style={{
              backgroundColor: THEME.primary,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 12,
              ...themeShadow('bar'),
            }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}
        </View>
      </View>
    </BugReportContext.Provider>
  );
}
