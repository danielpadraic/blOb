import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
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
  const color = tint === 'light' ? 'rgba(255,255,255,0.9)' : THEME.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `About ${copy(FIELD_NOTE_TITLE[note])}`}
      onPress={() => notes.open(note)}
      hitSlop={0}
      className="items-center justify-center"
      style={{ width: 44, height: 44 }}>
      <AppText className="text-[18px] font-semibold" style={{ color }}>
        ?
      </AppText>
    </Pressable>
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
