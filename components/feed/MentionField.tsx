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
  COMPOSER_MAX_LINES,
  COMPOSER_MIN_HEIGHT,
  composerFieldHeight,
} from '@/lib/composerField';
import { useKeyboardForm } from '@/components/ui/KeyboardFormShell';
import { THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';

const FONT = 15;
const LINE = COMPOSER_LINE_HEIGHT;
const MIN_HEIGHT = COMPOSER_MIN_HEIGHT;

type MentionFieldProps = {
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  collapsed?: boolean;
  /** Grow this many lines then scroll inside the field. Default is the shared Home lock. */
  maxLines?: number;
  pickerPlacement?: 'above' | 'below' | 'flow';
  initialText?: string;
  initialChips?: MentionChip[];
  initialMention?: MentionChip | null;
  audience: PostAudience | string;
  audienceUserIds: string[];
  memberIds?: string[];
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
  seedMention: (chip: MentionChip) => void;
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getDoc: () => MentionDoc;
};

function seedFromMention(
  initialText?: string,
  initialChips?: MentionChip[],
  initialMention?: MentionChip | null,
): { text: string; chips: MentionChip[]; selection: TextSelection } {
  if (initialMention?.userId && !String(initialText ?? '').trim()) {
    const next = insertMention('', { start: 0, end: 0 }, mentionInsertLabel(initialMention), { suffix: ' ' });
    return { text: next.text, chips: [initialMention], selection: next.selection };
  }
  const text = initialText ?? '';
  return {
    text,
    chips: initialChips ?? [],
    selection: { start: text.length, end: text.length },
  };
}

function MentionFieldInner(
  {
    placeholder,
    autoFocus,
    compact,
    collapsed,
    maxLines: maxLinesProp,
    pickerPlacement = 'below',
    initialText,
    initialChips,
    initialMention,
    audience,
    audienceUserIds,
    memberIds,
    excludeIds,
    onChange,
    onFocus,
    onBlur,
    accessibilityLabel,
    tone = 'default',
  }: MentionFieldProps,
  ref: ForwardedRef<MentionFieldHandle>,
) {
  const seeded = seedFromMention(initialText, initialChips, initialMention);
  const inputRef = useRef<TextInput>(null);
  const boxRef = useRef<View>(null);
  const form = useKeyboardForm();
  const seededMentionId = useRef<string | null>(initialMention?.userId ?? null);
  const textRef = useRef(seeded.text);
  const chipsRef = useRef<MentionChip[]>(seeded.chips);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [text, setText] = useState(seeded.text);
  const [selection, setSelection] = useState<TextSelection>(seeded.selection);
  const [chips, setChips] = useState<MentionChip[]>(seeded.chips);
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
    memberIds,
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
    seedMention: (chip: MentionChip) => {
      if (!chip.userId || textRef.current.trim()) {
        return;
      }
      if (chipsRef.current.some((row) => row.userId === chip.userId)) {
        return;
      }
      seededMentionId.current = chip.userId;
      const next = insertMention('', { start: 0, end: 0 }, mentionInsertLabel(chip), { suffix: ' ' });
      commit(next.text, next.selection, [chip], true);
    },
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clear: () => {
      commit('', { start: 0, end: 0 }, [], true);
      inputRef.current?.blur();
    },
    getDoc: () => mentionDocFromState(textRef.current, chipsRef.current),
  }));

  useEffect(() => {
    if (seeded.text) {
      onChangeRef.current(mentionDocFromState(seeded.text, seeded.chips));
    }
    // Seed once from the author already on the row. Do not wait on search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mentionId = initialMention?.userId ?? '';
    if (!mentionId || !initialMention || textRef.current.trim()) {
      return;
    }
    if (seededMentionId.current === mentionId) {
      return;
    }
    seededMentionId.current = mentionId;
    const next = insertMention('', { start: 0, end: 0 }, mentionInsertLabel(initialMention), { suffix: ' ' });
    commit(next.text, next.selection, [initialMention], true);
    if (autoFocus) {
      keepFocus();
    }
    // Seed @author when Reply sets a mention. Keyed remount also covers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, initialMention?.userId]);

  useEffect(() => {
    if (!query) {
      setSuppressed(false);
    }
  }, [query]);

  useEffect(() => {
    applyHeight(text);
    // Recalc when chrome collapses so a draft stays visible line-by-line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, text]);

  function pick(chip: MentionChip) {
    const next = insertMention(text, selection, mentionInsertLabel(chip), { suffix: ' ' });
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
  const heightLocked = Boolean(collapsed && !text.trim());
  const maxLines = maxLinesProp ?? COMPOSER_MAX_LINES;
  const maxHeight = LINE * maxLines + Math.max(0, MIN_HEIGHT - LINE);

  function applyHeight(nextText: string, contentHeight?: number) {
    const next = composerFieldHeight({
      collapsed: heightLocked,
      text: nextText,
      contentHeight,
      maxLines,
    });
    setHeight((current) => (current === next ? current : next));
  }

  const dropdown = open ? (
    <View
      style={{
        position: pickerPlacement === 'flow' ? 'relative' : 'absolute',
        left: 0,
        right: 0,
        bottom: pickerPlacement === 'above' ? '100%' : undefined,
        top: pickerPlacement === 'above' ? undefined : pickerPlacement === 'flow' ? undefined : '100%',
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
    <View ref={boxRef} collapsable={false} style={{ position: 'relative', zIndex: open ? 20 : 0 }}>
      {open && pickerPlacement !== 'flow' ? (
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
            top: pickerPlacement === 'above' ? -640 : 0,
            bottom: pickerPlacement === 'above' ? 0 : -640,
            left: -80,
            right: -80,
            zIndex: 10,
          }}
        />
      ) : null}
      {pickerPlacement === 'above' ? dropdown : null}
      <View style={{ position: 'relative' }}>
      {!text.trim() && placeholder ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 6, zIndex: 1 }}>
          <AppText
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: frost ? 'rgba(255,255,255,0.5)' : THEME.textMuted,
              fontSize: compact ? 13 : 14,
              lineHeight: LINE,
            }}>
            {placeholder}
          </AppText>
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={text}
        {...(forced ? { selection: forced } : null)}
        onSelectionChange={onSelectionChange}
        onKeyPress={onKeyPress}
        onChangeText={(value) => {
          const next = applyTokenAwareTextChange(text, value, selection, chips, punctReadyIds);
          setSuppressed(false);
          commit(next.text, next.selection, next.chips, next.forced, next.punctReadyIds);
          applyHeight(next.text);
        }}
        placeholder=""
        placeholderTextColor={frost ? 'rgba(255,255,255,0.5)' : THEME.textMuted}
        autoFocus={autoFocus}
        multiline
        scrollEnabled={!heightLocked && height >= maxHeight - 2}
        blurOnSubmit={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        autoCorrect
        autoCapitalize="sentences"
        keyboardType="default"
        accessibilityLabel={accessibilityLabel ?? 'Write a post'}
        onFocus={() => {
          form?.setFieldFocused?.(true);
          if (!compact && boxRef.current) {
            form?.scrollFieldIntoView(boxRef.current);
          }
          onFocus?.();
        }}
        onBlur={() => {
          form?.setFieldFocused?.(false);
          onBlur?.();
        }}
        onContentSizeChange={(event) => {
          applyHeight(text, event.nativeEvent.contentSize.height);
        }}
        style={{
          minHeight: MIN_HEIGHT,
          maxHeight: heightLocked ? MIN_HEIGHT : maxHeight,
          paddingVertical: 6,
          paddingHorizontal: 0,
          color: frost ? '#F5F5F5' : THEME.textPrimary,
          fontSize: frost ? 14 : FONT,
          lineHeight: LINE,
          textAlignVertical: 'top',
          ...(Platform.OS === 'web'
            ? ({
                minHeight: heightLocked ? MIN_HEIGHT : height,
                height: undefined,
                overflowY: 'auto',
                resize: 'none',
                fieldSizing: heightLocked ? 'fixed' : 'content',
                outlineStyle: 'none',
                caretColor: frost ? '#F5F5F5' : THEME.textPrimary,
              } as object)
            : {
                height: heightLocked ? MIN_HEIGHT : height,
                cursorColor: THEME.textPrimary,
              }),
        }}
      />
      </View>
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
      {pickerPlacement === 'below' || pickerPlacement === 'flow' ? dropdown : null}
    </View>
  );
}

export const MentionField = memo(forwardRef(MentionFieldInner));
