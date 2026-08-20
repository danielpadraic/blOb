import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  FIELD_NOTE_BODY,
  FIELD_NOTE_TITLE,
  type FieldNoteKey,
} from '@/lib/challengeFieldNotes';
import { THEME, themeShadow } from '@/lib/theme';

type ChallengeNotesApi = {
  open: (note: FieldNoteKey) => void;
};

const ChallengeNotesContext = createContext<ChallengeNotesApi | null>(null);

const NOTE_CIRCLE = 21;
const NOTE_HIT = 44;
const NOTE_INSET = (NOTE_HIT - NOTE_CIRCLE) / 2;

export function useChallengeNotesOptional(): ChallengeNotesApi | null {
  return useContext(ChallengeNotesContext);
}

export function ChallengeNotesProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<FieldNoteKey | null>(null);
  const api = useMemo<ChallengeNotesApi>(() => ({ open: setNote }), []);

  return (
    <ChallengeNotesContext.Provider value={api}>
      <View className="flex-1" style={{ position: 'relative', minHeight: 0, overflow: 'visible' }}>
        {children}
        <FieldNoteSheet note={note} onClose={() => setNote(null)} />
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
  if (!notes) {
    return null;
  }
  const color = tint === 'light' ? 'rgba(255,255,255,0.72)' : THEME.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `About ${copy(FIELD_NOTE_TITLE[note])}`}
      onPress={(event) => {
        event.stopPropagation();
        notes.open(note);
      }}
      hitSlop={0}
      className="items-center justify-center"
      style={{
        width: NOTE_HIT,
        height: NOTE_HIT,
        marginTop: -NOTE_INSET,
        marginBottom: -NOTE_INSET,
        marginLeft: -NOTE_INSET + 2,
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
          className="text-[11px] font-medium"
          style={{ color, lineHeight: 13, textTransform: 'none' }}>
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

function FieldNoteSheet({
  note,
  onClose,
}: {
  note: FieldNoteKey | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!note) {
    return null;
  }

  return (
    <ChromeOverlay visible onClose={onClose} align="end">
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: Math.max(insets.bottom, 16),
          ...themeShadow('card'),
        }}>
        <View className="items-center pt-2">
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: THEME.border,
            }}
          />
        </View>
        <View className="flex-row items-center px-4 pt-1">
          <AppText className="flex-1 text-[18px] font-extrabold text-charcoal">
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
              borderRadius: 22,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
            }}>
            <AppText className="text-[20px] font-semibold text-muted">×</AppText>
          </Pressable>
        </View>
        <AppText className="px-4 pb-4 pt-1 text-[15px] leading-6 text-charcoal">
          {copy(FIELD_NOTE_BODY[note])}
        </AppText>
      </View>
    </ChromeOverlay>
  );
}
