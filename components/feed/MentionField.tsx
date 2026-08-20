import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useMentionCandidates } from '@/hooks/useMentionCandidates';
import { copy } from '@/lib/copy';
import {
  applyMentionPick,
  backspaceMentionParts,
  emptyMentionParts,
  mentionQueryFromText,
  serializeMentionParts,
  type MentionChip,
  type MentionDoc,
  type MentionPart,
} from '@/lib/mentions';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';
import { AppText } from '@/components/ui/AppText';

type MentionFieldProps = {
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  audience: PostAudience | string;
  audienceUserIds: string[];
  excludeIds?: string[];
  onChange: (doc: MentionDoc) => void;
  onSubmit?: () => void;
  accessibilityLabel?: string;
};

export function MentionField({
  placeholder,
  autoFocus,
  compact,
  audience,
  audienceUserIds,
  excludeIds,
  onChange,
  onSubmit,
  accessibilityLabel,
}: MentionFieldProps) {
  const [parts, setParts] = useState<MentionPart[]>(emptyMentionParts);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastPart = parts[parts.length - 1];
  const lastText = lastPart?.type === 'text' ? lastPart.value : '';
  const query = mentionQueryFromText(lastText);
  const open = pickerOpen || query != null;
  const candidates = useMentionCandidates({
    query: query ?? '',
    audience,
    audienceUserIds,
    excludeIds,
    enabled: open,
  });

  const chips = useMemo(
    () => parts.filter((part): part is Extract<MentionPart, { type: 'chip' }> => part.type === 'chip').map((part) => part.chip),
    [parts],
  );

  function commit(next: MentionPart[]) {
    setParts(next);
    onChange(serializeMentionParts(next));
  }

  function updateLastText(value: string) {
    const next = [...parts];
    const last = next[next.length - 1];
    if (last?.type === 'text') {
      last.value = value;
    } else {
      next.push({ type: 'text', id: `t-${Date.now()}`, value });
    }
    commit(next);
    if (mentionQueryFromText(value) != null) {
      setPickerOpen(true);
    }
  }

  function pick(chip: MentionChip) {
    commit(applyMentionPick(parts, chip));
    setPickerOpen(false);
  }

  function onKeyPress(key: string) {
    if (key !== 'Backspace') {
      return;
    }
    const last = parts[parts.length - 1];
    if (last?.type === 'text' && last.value.length > 0) {
      return;
    }
    commit(backspaceMentionParts(parts));
  }

  return (
    <View>
      <View
        className="flex-row flex-wrap items-center"
        style={{
          minHeight: compact ? 32 : 44,
          borderWidth: 0,
        }}>
        {parts.map((part) =>
          part.type === 'chip' ? (
            <View
              key={part.id}
              className="mr-1 mt-0.5 rounded-full px-2"
              style={{ backgroundColor: THEME.accentSoft, minHeight: 28, justifyContent: 'center' }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                @{part.chip.username}
              </AppText>
            </View>
          ) : part === parts[parts.length - 1] ? (
            <TextInput
              key={part.id}
              value={part.value}
              onChangeText={updateLastText}
              placeholder={chips.length === 0 ? placeholder : undefined}
              placeholderTextColor={THEME.textMuted}
              autoFocus={autoFocus}
              multiline
              blurOnSubmit={false}
              accessibilityLabel={accessibilityLabel ?? 'Write a post'}
              onKeyPress={(event) => onKeyPress(event.nativeEvent.key)}
              onSubmitEditing={onSubmit}
              style={{
                flexGrow: 1,
                minWidth: 72,
                minHeight: compact ? 32 : 36,
                paddingVertical: compact ? 4 : 6,
                color: THEME.textPrimary,
                fontSize: 14,
              }}
            />
          ) : (
            <AppText key={part.id} className="text-[14px] text-ink">
              {part.value}
            </AppText>
          ),
        )}
      </View>
      {compact ? null : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mention someone"
        onPress={() => {
          updateLastText(`${lastText}${lastText.endsWith(' ') || !lastText ? '@' : ' @'}`);
          setPickerOpen(true);
        }}
        hitSlop={8}
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
        <AppText className="text-[14px] font-extrabold" style={{ color: THEME.accent }}>
          @
        </AppText>
      </Pressable>
      )}
      {open ? (
        <View
          className="mt-1"
          style={{
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
                style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
                <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                  {personDisplayName(row)}
                </AppText>
                <AppText className="text-[12px] text-muted">@{row.username}</AppText>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
