import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
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
const MIN_HEIGHT = 38;
const MAX_HEIGHT = 116;

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
};

export const MentionField = forwardRef<MentionFieldHandle, MentionFieldProps>(function MentionField(
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
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const seeded = useRef(false);
  const [text, setText] = useState(initialText ?? '');
  const [selection, setSelection] = useState<TextSelection>({
    start: initialText?.length ?? 0,
    end: initialText?.length ?? 0,
  });
  const [chips, setChips] = useState<MentionChip[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [forced, setForced] = useState<TextSelection | null>(null);

  const tokens = useMemo(
    () => mentionTokenRanges(text, chips.map((chip) => chip.username)),
    [chips, text],
  );
  const query = mentionQueryAtCursor(text, selection.start);
  const open = pickerOpen || query != null;
  const candidates = useMentionCandidates({
    query: query?.query ?? '',
    audience,
    audienceUserIds,
    excludeIds,
    enabled: open,
  });

  function commit(
    nextText: string,
    nextSelection: TextSelection,
    nextChips = chips,
    forceCaret = true,
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
    if (forceCaret) {
      setForced(snapped);
    }
    onChange(mentionDocFromState(nextText, nextChips));
  }

  function keepFocus() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function insertAtTrigger() {
    const before = text.slice(0, selection.start);
    const insert = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}@`;
    const next = `${before}${insert}${text.slice(selection.end)}`;
    const caret = before.length + insert.length;
    commit(next, { start: caret, end: caret });
    setPickerOpen(true);
    keepFocus();
  }

  useImperativeHandle(ref, () => ({
    insertAt: insertAtTrigger,
    focus: () => inputRef.current?.focus(),
  }));

  useLayoutEffect(() => {
    if (seeded.current) {
      return;
    }
    if (!initialMention?.username) {
      seeded.current = true;
      return;
    }
    if (text.trim().length > 0) {
      seeded.current = true;
      return;
    }
    const next = insertMention('', { start: 0, end: 0 }, initialMention.username, { suffix: ' ' });
    commit(next.text, next.selection, [initialMention]);
    seeded.current = true;
    keepFocus();
  });

  function pick(chip: MentionChip) {
    const next = insertMention(text, selection, chip.username, { suffix: ' ' });
    const nextChips = chips.some((row) => row.userId === chip.userId) ? chips : [...chips, chip];
    commit(next.text, next.selection, nextChips);
    setPickerOpen(false);
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
  }

  const segments = useMemo(() => {
    if (!text || tokens.length === 0) {
      return [{ type: 'text' as const, value: text }];
    }
    const out: Array<{ type: 'text' | 'chip'; value: string }> = [];
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) {
        out.push({ type: 'text', value: text.slice(cursor, token.start) });
      }
      out.push({ type: 'chip', value: text.slice(token.start, token.end) });
      cursor = token.end;
    }
    if (cursor < text.length) {
      out.push({ type: 'text', value: text.slice(cursor) });
    }
    return out;
  }, [text, tokens]);

  const showOverlay = text.length > 0;
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
      {pickerPlacement === 'above' ? dropdown : null}
      <View style={{ minHeight: MIN_HEIGHT, justifyContent: 'center' }}>
        {showOverlay ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: height > MIN_HEIGHT + 4 ? 'flex-start' : 'center',
              paddingVertical: 8,
            }}>
            <AppText
              style={{
                fontSize: FONT,
                lineHeight: LINE,
                color: THEME.textPrimary,
              }}>
              {segments.map((part, index) =>
                part.type === 'chip' ? (
                  <AppText
                    key={`${part.value}-${index}`}
                    style={{
                      backgroundColor: THEME.accentSoft,
                      color: THEME.accent,
                      borderRadius: 999,
                      overflow: 'hidden',
                      fontSize: FONT,
                      lineHeight: LINE,
                      fontWeight: '600',
                    }}>
                    {part.value}
                  </AppText>
                ) : (
                  <AppText
                    key={`${index}-${part.value.slice(0, 8)}`}
                    style={{ fontSize: FONT, lineHeight: LINE, color: THEME.textPrimary }}>
                    {part.value}
                  </AppText>
                ),
              )}
            </AppText>
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          value={text}
          selection={forced ?? undefined}
          onSelectionChange={onSelectionChange}
          onChangeText={(value) => {
            const next = applyTokenAwareTextChange(text, value, selection, tokens);
            const liveChips = mentionDocFromState(next.text, chips).chips;
            commit(next.text, next.selection, liveChips, next.forced);
            if (mentionQueryAtCursor(next.text, next.selection.start)) {
              setPickerOpen(true);
            }
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
              Math.max(MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height) + 16),
            );
            setHeight(next);
          }}
          style={{
            minHeight: MIN_HEIGHT,
            height,
            maxHeight: MAX_HEIGHT,
            paddingVertical: 8,
            paddingHorizontal: 0,
            color: showOverlay ? 'transparent' : THEME.textPrimary,
            fontSize: FONT,
            lineHeight: LINE,
            textAlignVertical: height > MIN_HEIGHT + 4 ? 'top' : 'center',
            ...(Platform.OS === 'web'
              ? ({
                  outlineStyle: 'none',
                  caretColor: THEME.textPrimary,
                } as object)
              : { cursorColor: THEME.textPrimary }),
          }}
        />
      </View>
      {compact ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mention someone"
          onPress={insertAtTrigger}
          hitSlop={8}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-extrabold" style={{ color: THEME.accent }}>
            @
          </AppText>
        </Pressable>
      )}
      {pickerPlacement === 'below' ? dropdown : null}
    </View>
  );
});
