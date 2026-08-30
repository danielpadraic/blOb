import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useMentionCandidates } from '@/hooks/useMentionCandidates';
import { copy } from '@/lib/copy';
import {
  applyTokenAwareTextChange,
  insertMention,
  mentionDocFromState,
  mentionInsertLabel,
  mentionQueryAtCursor,
  mentionRangeKey,
  mentionTokenRanges,
  snapSelectionOutOfToken,
  type MentionChip,
  type MentionDoc,
  type TextSelection,
} from '@/lib/mentions';
import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  composerFieldHeight,
} from '@/lib/composerField';
import { THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';

const FONT = 15;
const LINE = COMPOSER_LINE_HEIGHT;
const MIN_HEIGHT = COMPOSER_MIN_HEIGHT;
const MAX_HEIGHT = COMPOSER_MAX_HEIGHT;

type MentionFieldProps = {
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  collapsed?: boolean;
  pickerPlacement?: 'above' | 'below';
  initialText?: string;
  initialMention?: MentionChip | null;
  audience: PostAudience | string;
  audienceUserIds: string[];
  excludeIds?: string[];
  onChange: (doc: MentionDoc) => void;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'frost';
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
    collapsed,
    pickerPlacement = 'below',
    initialText,
    initialMention,
    audience,
    audienceUserIds,
    excludeIds,
    onChange,
    onFocus,
    onBlur,
    accessibilityLabel,
    tone = 'default',
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
  const [punctReadyIds, setPunctReadyIds] = useState<string[]>([]);
  const [forced, setForced] = useState<TextSelection | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [height, setHeight] = useState(MIN_HEIGHT);

  textRef.current = text;
  chipsRef.current = chips;

  const tokens = useMemo(() => mentionTokenRanges(text, chips), [chips, text]);
  const query = mentionQueryAtCursor(text, selection.start);
  const open = Boolean(query) && !suppressed && !collapsed;
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
    nextPunct = punctReadyIds,
  ) {
    const snapped = snapSelectionOutOfToken(nextSelection, mentionTokenRanges(nextText, nextChips));
    setText(nextText);
    setSelection(snapped);
    setChips(nextChips);
    setPunctReadyIds(nextPunct);
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
    if (!initialMention?.userId || textRef.current.trim()) {
      return;
    }
    const next = insertMention('', { start: 0, end: 0 }, mentionInsertLabel(initialMention));
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

  useEffect(() => {
    const next = composerFieldHeight({ collapsed, text });
    setHeight((current) => (current === next ? current : next));
  }, [collapsed, text]);

  function pick(chip: MentionChip) {
    const next = insertMention(text, selection, mentionInsertLabel(chip));
    const nextChips = chips.some((row) => row.userId === chip.userId) ? chips : [...chips, chip];
    setSuppressed(true);
    commit(next.text, next.selection, nextChips, true, []);
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
    setPunctReadyIds((ids) =>
      ids.filter((id) => tokens.some((range) => mentionRangeKey(range) === id && next.start === range.end)),
    );
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

  const frost = tone === 'frost';

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
        backgroundColor: frost ? 'rgba(16,19,18,0.94)' : THEME.surface,
        borderWidth: 1,
        borderColor: frost ? 'rgba(255,255,255,0.12)' : THEME.border,
        borderRadius: 14,
        maxHeight: 180,
        overflow: 'hidden',
      }}>
      {candidates.isLoading && candidates.data.length === 0 ? (
        <AppText className="px-3 py-3 text-[13px] text-muted">{copy('mention.picker')}</AppText>
      ) : candidates.data.length === 0 ? (
        <AppText className="px-3 py-3 text-[13px] text-muted">{copy('mention.empty')}</AppText>
      ) : (
        candidates.data.slice(0, 8).map((row) => (
          <Pressable
            key={`${row.kind}-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${row.label}`}
            onPress={() =>
              pick({
                userId: row.id,
                username: row.username,
                label: row.label,
                kind: row.kind,
              })
            }
            {...(Platform.OS === 'web'
              ? {
                  onMouseDown: (event: { preventDefault: () => void }) => {
                    event.preventDefault();
                  },
                }
              : null)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
            {row.kind === 'user' ? (
              <Avatar uri={row.avatarUrl} name={row.label} size={28} />
            ) : (
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: row.kind === 'circle' ? THEME.circleSoft : THEME.accentSoft,
                }}>
                <Glyph
                  name={row.kind === 'circle' ? GLYPH.circle : GLYPH.flag}
                  color={row.kind === 'circle' ? THEME.circle : THEME.accent}
                  size={14}
                />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText
                className={frost ? 'text-[13px] font-semibold' : 'text-[14px] font-semibold text-charcoal'}
                style={frost ? { color: '#F5F5F5' } : undefined}
                numberOfLines={1}>
                {row.label}
              </AppText>
              {row.subtitle ? (
                <AppText className="text-[12px] text-muted" numberOfLines={1}>
                  {row.subtitle}
                </AppText>
              ) : null}
            </View>
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
          const next = applyTokenAwareTextChange(text, value, selection, chips, punctReadyIds);
          setSuppressed(false);
          commit(next.text, next.selection, next.chips, next.forced, next.punctReadyIds);
          const nextHeight = composerFieldHeight({ collapsed, text: next.text });
          if (nextHeight !== height) {
            setHeight(nextHeight);
          }
        }}
        placeholder={placeholder}
        placeholderTextColor={frost ? 'rgba(255,255,255,0.5)' : THEME.textMuted}
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
        onFocus={onFocus}
        onBlur={onBlur}
        onContentSizeChange={(event) => {
          const next = composerFieldHeight({
            collapsed,
            text,
            contentHeight: event.nativeEvent.contentSize.height,
          });
          if (next !== height) {
            setHeight(next);
          }
        }}
        style={{
          minHeight: MIN_HEIGHT,
          maxHeight: collapsed ? MIN_HEIGHT : MAX_HEIGHT,
          paddingVertical: 6,
          paddingHorizontal: 0,
          color: frost ? '#F5F5F5' : THEME.textPrimary,
          fontSize: frost ? 14 : FONT,
          lineHeight: LINE,
          textAlignVertical: 'top',
          ...(Platform.OS === 'web'
            ? ({
                minHeight: collapsed ? MIN_HEIGHT : height,
                height: undefined,
                overflowY: 'auto',
                resize: 'none',
                fieldSizing: collapsed ? 'fixed' : 'content',
                outlineStyle: 'none',
                caretColor: THEME.textPrimary,
              } as object)
            : {
                height: collapsed ? MIN_HEIGHT : height,
                cursorColor: THEME.textPrimary,
              }),
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
