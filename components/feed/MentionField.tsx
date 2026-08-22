import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from 'react';
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useMentionCandidates } from '@/hooks/useMentionCandidates';
import { copy } from '@/lib/copy';
import {
  applyTokenAwareTextChange,
  insertMention,
  mentionDocFromState,
  mentionQueryAtCursor,
  mentionTokenRanges,
  snapSelectionOutOfToken,
  type MentionChip,
  type MentionDoc,
  type TextSelection,
} from '@/lib/mentions';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';

const FONT = 15;
const LINE = 20;
const MIN_HEIGHT = 36;
const MAX_HEIGHT = LINE * 5 + 12;

type MentionFieldProps = {
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  pickerPlacement?: 'above' | 'below';
  initialText?: string;
  initialMention?: MentionChip | null;
  audience: PostAudience | string;
  audienceUserIds: string[];
  excludeIds?: string[];
  onChange: (doc: MentionDoc) => void;
  onSubmit?: () => void;
  accessibilityLabel?: string;
};

export type MentionFieldHandle = {
  insertAt: () => void;
  focus: () => void;
  getDoc: () => MentionDoc;
};

function MentionFieldInner(
  {
    placeholder,
    autoFocus,
    compact,
    pickerPlacement = 'below',
    initialText,
    initialMention,
    audience,
    audienceUserIds,
    excludeIds,
    onChange,
    onSubmit,
    accessibilityLabel,
  }: MentionFieldProps,
  ref: ForwardedRef<MentionFieldHandle>,
) {
  const inputRef = useRef<TextInput>(null);
  const seeded = useRef(false);
  const textRef = useRef(initialText ?? '');
  const chipsRef = useRef<MentionChip[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [text, setText] = useState(initialText ?? '');
  const [selection, setSelection] = useState<TextSelection>({
    start: initialText?.length ?? 0,
    end: initialText?.length ?? 0,
  });
  const [chips, setChips] = useState<MentionChip[]>([]);
  const [forced, setForced] = useState<TextSelection | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [height, setHeight] = useState(MIN_HEIGHT);

  textRef.current = text;
  chipsRef.current = chips;

  const tokens = mentionTokenRanges(
    text,
    chips.map((chip) => chip.username),
  );
  const query = mentionQueryAtCursor(text, selection.start);
  const open = Boolean(query) && !suppressed;
  const candidates = useMentionCandidates({
    query: query?.query ?? '',
    audience,
    audienceUserIds,
    excludeIds,
    enabled: open,
  });

  function emit(nextText: string, nextChips: MentionChip[]) {
    onChangeRef.current(mentionDocFromState(nextText, nextChips));
  }

  function commit(
    nextText: string,
    nextSelection: TextSelection,
    nextChips = chips,
    forceCaret = false,
  ) {
    const snapped = snapSelectionOutOfToken(
      nextSelection,
      mentionTokenRanges(
        nextText,
        nextChips.map((chip) => chip.username),
      ),
    );
    setText(nextText);
    setSelection(snapped);
    setChips(nextChips);
    setForced(forceCaret ? snapped : null);
    if (!mentionQueryAtCursor(nextText, snapped.start)) {
      setSuppressed(false);
    }
    emit(nextText, nextChips);
  }

  function keepFocus() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function insertAtTrigger() {
    const before = text.slice(0, selection.start);
    const insert = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}@`;
    const next = `${before}${insert}${text.slice(selection.end)}`;
    const caret = before.length + insert.length;
    setSuppressed(false);
    commit(next, { start: caret, end: caret }, chips, true);
    keepFocus();
  }

  useImperativeHandle(ref, () => ({
    insertAt: insertAtTrigger,
    focus: () => inputRef.current?.focus(),
    getDoc: () => mentionDocFromState(textRef.current, chipsRef.current),
  }));

  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;
    if (!initialMention?.username || textRef.current.trim()) {
      return;
    }
    const next = insertMention('', { start: 0, end: 0 }, initialMention.username, { suffix: ' ' });
    commit(next.text, next.selection, [initialMention], true);
    keepFocus();
    // Seed the reply @author token once. Do not re-run when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query) {
      setSuppressed(false);
    }
  }, [query]);

  function pick(chip: MentionChip) {
    const next = insertMention(text, selection, chip.username, { suffix: ' ' });
    const nextChips = chips.some((row) => row.userId === chip.userId) ? chips : [...chips, chip];
    setSuppressed(true);
    commit(next.text, next.selection, nextChips, true);
    keepFocus();
  }

  function dismissPicker() {
    setSuppressed(true);
    keepFocus();
  }

  function onSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const native = event.nativeEvent.selection;
    const next = snapSelectionOutOfToken(native, tokens);
    setSelection(next);
    if (next.start !== native.start || next.end !== native.end) {
      setForced(next);
    } else if (forced) {
      setForced(null);
    }
    if (mentionQueryAtCursor(text, next.start)) {
      setSuppressed(false);
    }
  }

  function onKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (event.nativeEvent.key === 'Escape') {
      event.preventDefault?.();
      setSuppressed(true);
    }
  }

  const dropdown = open ? (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: pickerPlacement === 'above' ? '100%' : undefined,
        top: pickerPlacement === 'above' ? undefined : '100%',
        zIndex: 40,
        marginBottom: pickerPlacement === 'above' ? 4 : 0,
        marginTop: pickerPlacement === 'above' ? 0 : 4,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 14,
        maxHeight: 220,
        overflow: 'hidden',
      }}>
      {candidates.isLoading && candidates.data.length === 0 ? (
        <AppText className="px-3 py-3 text-[13px] text-muted">{copy('mention.picker')}</AppText>
      ) : candidates.data.length === 0 ? (
        <AppText className="px-3 py-3 text-[13px] text-muted">{copy('mention.empty')}</AppText>
      ) : (
        candidates.data.slice(0, 8).map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${row.username}`}
            onPress={() =>
              pick({
                userId: row.id,
                username: row.username,
                label: personDisplayName(row),
              })
            }
            {...(Platform.OS === 'web'
              ? {
                  onMouseDown: (event: { preventDefault: () => void }) => {
                    event.preventDefault();
                  },
                }
              : null)}
            style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
              {personDisplayName(row)}
            </AppText>
            <AppText className="text-[12px] text-muted">@{row.username}</AppText>
          </Pressable>
        ))
      )}
    </View>
  ) : null;

  return (
    <View style={{ position: 'relative', zIndex: open ? 20 : 0 }}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss mentions"
          onPress={dismissPicker}
          {...(Platform.OS === 'web'
            ? {
                onMouseDown: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                },
              }
            : null)}
          style={{
            position: 'absolute',
            top: -640,
            bottom: -640,
            left: -80,
            right: -80,
            zIndex: 10,
          }}
        />
      ) : null}
      {pickerPlacement === 'above' ? dropdown : null}
      <TextInput
        ref={inputRef}
        value={text}
        selection={forced ?? undefined}
        onSelectionChange={onSelectionChange}
        onKeyPress={onKeyPress}
        onChangeText={(value) => {
          const next = applyTokenAwareTextChange(text, value, selection, tokens);
          const liveChips = mentionDocFromState(next.text, chips).chips;
          setSuppressed(false);
          commit(next.text, next.selection, liveChips, next.forced);
        }}
        placeholder={placeholder}
        placeholderTextColor={THEME.textMuted}
        autoFocus={autoFocus}
        multiline
        scrollEnabled={height >= MAX_HEIGHT - 2}
        blurOnSubmit={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        autoCorrect
        autoCapitalize="sentences"
        keyboardType="default"
        accessibilityLabel={accessibilityLabel ?? 'Write a post'}
        onSubmitEditing={onSubmit}
        onContentSizeChange={(event) => {
          const next = Math.min(
            MAX_HEIGHT,
            Math.max(MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height)),
          );
          if (next !== height) {
            setHeight(next);
          }
        }}
        style={{
          minHeight: MIN_HEIGHT,
          height,
          maxHeight: MAX_HEIGHT,
          paddingVertical: 6,
          paddingHorizontal: 0,
          color: THEME.textPrimary,
          fontSize: FONT,
          lineHeight: LINE,
          textAlignVertical: 'center',
          ...(Platform.OS === 'web'
            ? ({
                outlineStyle: 'none',
                caretColor: THEME.textPrimary,
              } as object)
            : { cursorColor: THEME.textPrimary }),
        }}
      />
      {compact ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mention someone"
          onPress={insertAtTrigger}
          hitSlop={8}
          style={{ minHeight: 36, minWidth: 36, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-extrabold" style={{ color: THEME.accent }}>
            @
          </AppText>
        </Pressable>
      )}
      {pickerPlacement === 'below' ? dropdown : null}
    </View>
  );
}

export const MentionField = memo(forwardRef(MentionFieldInner));
