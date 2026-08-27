import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
} from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { isInsideTabChrome } from '@/components/wallet/TabChrome';
import { copy } from '@/lib/copy';
import {
  FIELD_NOTE_BODY,
  FIELD_NOTE_TITLE,
  type FieldNoteKey,
} from '@/lib/challengeFieldNotes';
import { measureInWindowSafe } from '@/lib/measureWindow';
import { TAB_BAR_HEIGHT, TAB_BAR_GUTTER, THEME, themeShadow } from '@/lib/theme';

type NoteAnchor = { x: number; y: number; width: number; height: number };

type ChallengeNotesApi = {
  open: (note: FieldNoteKey, anchor: NoteAnchor) => void;
  close: () => void;
  active: FieldNoteKey | null;
};

const ChallengeNotesContext = createContext<ChallengeNotesApi | null>(null);

const NOTE_CIRCLE = 15;
const NOTE_HIT = 44;
const NOTE_INSET = (NOTE_HIT - NOTE_CIRCLE) / 2;
const POP_W = 268;
const POP_PAD = 8;
const POP_GAP = 6;

export function useChallengeNotesOptional(): ChallengeNotesApi | null {
  return useContext(ChallengeNotesContext);
}

export function ChallengeNotesProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ note: FieldNoteKey; anchor: NoteAnchor } | null>(null);
  const api = useMemo<ChallengeNotesApi>(
    () => ({
      open: (note, anchor) => {
        setSession((current) => (current?.note === note ? null : { note, anchor }));
      },
      close: () => setSession(null),
      active: session?.note ?? null,
    }),
    [session?.note],
  );

  return (
    <ChallengeNotesContext.Provider value={api}>
      <View className="flex-1" style={{ position: 'relative', minHeight: 0, overflow: 'visible' }}>
        {children}
        <FieldNotePopover
          note={session?.note ?? null}
          anchor={session?.anchor ?? null}
          onClose={() => setSession(null)}
        />
      </View>
    </ChallengeNotesContext.Provider>
  );
}

export function FieldNoteButton({
  note,
  tint = 'dark',
  accessibilityLabel,
}: {
  note: FieldNoteKey;
  tint?: 'light' | 'dark';
  accessibilityLabel?: string;
}) {
  const notes = useChallengeNotesOptional();
  const ref = useRef<View>(null);
  if (!notes) {
    return null;
  }
  const color = tint === 'light' ? 'rgba(255,255,255,0.72)' : THEME.textMuted;
  const open = notes.active === note;

  function toggle() {
    measureInWindowSafe(ref.current, ({ x, y, width, height }) => {
      notes?.open(note, {
        x,
        y,
        width: width || NOTE_HIT,
        height: height || NOTE_HIT,
      });
    });
  }

  return (
    <Pressable
      ref={ref}
      collapsable={false}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={accessibilityLabel ?? `About ${copy(FIELD_NOTE_TITLE[note])}`}
      onPress={(event) => {
        event.stopPropagation();
        toggle();
      }}
      hitSlop={0}
      className="items-center justify-center"
      style={{
        width: NOTE_HIT,
        height: NOTE_HIT,
        marginTop: -NOTE_INSET + 1,
        marginBottom: -NOTE_INSET,
        marginLeft: -NOTE_INSET + 4,
        marginRight: -NOTE_INSET,
        zIndex: 1,
      }}>
      <View
        style={{
          width: NOTE_CIRCLE,
          height: NOTE_CIRCLE,
          borderRadius: NOTE_CIRCLE / 2,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        }}>
        <AppText
          selectable={false}
          style={{
            color,
            fontSize: 10,
            lineHeight: 12,
            fontWeight: '600',
            textTransform: 'none',
            ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
          }}>
          i
        </AppText>
      </View>
    </Pressable>
  );
}

/** Label with the info mark on the top-right of the word. Amount stays on the next line. */
export function FieldNoteLabel({
  note,
  tint = 'dark',
  children,
  textClassName,
  textStyle,
  numberOfLines,
}: {
  note: FieldNoteKey;
  tint?: 'light' | 'dark';
  children: string;
  textClassName?: string;
  textStyle?: TextStyle;
  numberOfLines?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}>
      <AppText
        className={textClassName}
        style={[{ flexShrink: 1 }, textStyle]}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={numberOfLines === 1}
        minimumFontScale={0.75}>
        {children}
      </AppText>
      <FieldNoteButton note={note} tint={tint} />
    </View>
  );
}

function FieldNotePopover({
  note,
  anchor,
  onClose,
}: {
  note: FieldNoteKey | null;
  anchor: NoteAnchor | null;
  onClose: () => void;
}) {
  const hostRef = useRef<View>(null);
  const [host, setHost] = useState<NoteAnchor | null>(null);
  const [cardSize, setCardSize] = useState({ width: POP_W, height: 148 });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const tabPad = isInsideTabChrome(segments as string[])
    ? TAB_BAR_HEIGHT + Math.max(insets.bottom, TAB_BAR_GUTTER) + 12
    : Math.max(insets.bottom, POP_PAD);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardInset(event.endCoordinates.height);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      const windowH = Dimensions.get('window').height;
      const overlap = Math.max(0, windowH - event.endCoordinates.screenY);
      setKeyboardInset(overlap);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardInset(0));
    return () => {
      show.remove();
      frame.remove();
      hide.remove();
    };
  }, []);

  function measureHost() {
    measureInWindowSafe(hostRef.current, ({ x, y, width, height }) => {
      setHost({ x, y, width, height });
    });
  }

  if (!note || !anchor) {
    return null;
  }

  const windowSize = Dimensions.get('window');
  const hostX = host?.x ?? 0;
  const hostY = host?.y ?? 0;
  const hostW = host?.width || windowSize.width;
  const hostH = host?.height || windowSize.height;
  const popW = Math.min(POP_W, Math.max(196, hostW - POP_PAD * 2));
  const popH = cardSize.height;
  const localX = anchor.x - hostX;
  const localY = anchor.y - hostY;
  const hostBottom = hostY + hostH;
  const kbTop = windowSize.height - keyboardInset;
  const kbOverlap = keyboardInset > 0 ? Math.max(0, hostBottom - kbTop) : 0;
  const bottomGuard = Math.max(kbOverlap > 0 ? kbOverlap + POP_PAD : tabPad, POP_PAD);
  const usableH = Math.max(hostH - bottomGuard, popH + POP_PAD * 2);

  let top = localY + anchor.height + POP_GAP;
  if (top + popH > usableH - POP_PAD) {
    const above = localY - POP_GAP - popH;
    top = above >= POP_PAD ? above : Math.max(POP_PAD, usableH - popH - POP_PAD);
  }
  let left = localX - 12;
  left = Math.min(Math.max(POP_PAD, left), Math.max(POP_PAD, hostW - popW - POP_PAD));

  return (
    <View
      ref={hostRef}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={measureHost}
      style={styles.host}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={styles.dismiss}
      />
      <View
        pointerEvents="auto"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0 && (width !== cardSize.width || height !== cardSize.height)) {
            setCardSize({ width, height });
          }
        }}
        style={[
          styles.card,
          {
            top,
            left,
            width: popW,
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            ...themeShadow('card'),
          },
        ]}>
        <View className="flex-row items-start">
          <AppText className="min-w-0 flex-1 pr-2 text-[15px] font-extrabold text-charcoal">
            {copy(FIELD_NOTE_TITLE[note])}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="items-center justify-center"
            style={{
              height: 44,
              width: 44,
              marginTop: -10,
              marginRight: -10,
            }}>
            <AppText className="text-[20px] font-semibold text-muted">×</AppText>
          </Pressable>
        </View>
        <AppText className="text-[14px] leading-5 text-charcoal">{copy(FIELD_NOTE_BODY[note])}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 60,
    elevation: 60,
  },
  dismiss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 19, 18, 0.28)',
  },
  card: {
    position: 'absolute',
    zIndex: 61,
    elevation: 61,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    maxWidth: POP_W,
  },
});
