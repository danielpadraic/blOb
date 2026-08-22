import { useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { AppText } from '@/components/ui/AppText';
import type { MentionChip, MentionDoc } from '@/lib/mentions';
import type { PostAudience } from '@/lib/postAudience';
import { THEME } from '@/lib/theme';

type InlineComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  submitLabel?: string;
  audience?: PostAudience | string;
  audienceUserIds?: string[];
  replyTo?: MentionChip | null;
  onSubmit: (content: string, mentionedUserIds: string[]) => Promise<unknown> | void;
};

export function InlineComposer({
  placeholder = 'Write a reply…',
  submitting,
  submitLabel = 'Reply',
  audience = 'public',
  audienceUserIds = [],
  replyTo,
  onSubmit,
}: InlineComposerProps) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const docRef = useRef<MentionDoc>({ text: '', chips: [] });
  const [canSend, setCanSend] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);

  function onDocChange(doc: MentionDoc) {
    docRef.current = doc;
    const next = doc.text.trim().length > 0;
    setCanSend((current) => (current === next ? current : next));
  }

  async function submit() {
    const latest = fieldRef.current?.getDoc() ?? docRef.current;
    const trimmed = latest.text.trim();
    if (!trimmed || submitting) {
      return;
    }
    await onSubmit(
      trimmed,
      latest.chips.map((chip) => chip.userId),
    );
    docRef.current = { text: '', chips: [] };
    setCanSend(false);
    setFieldKey((value) => value + 1);
  }

  return (
    <View style={{ gap: 6 }}>
      <MentionField
        key={fieldKey}
        ref={fieldRef}
        compact
        pickerPlacement="above"
        autoFocus
        placeholder={placeholder}
        initialMention={replyTo}
        audience={audience}
        audienceUserIds={audienceUserIds}
        onChange={onDocChange}
        onSubmit={() => void submit()}
        accessibilityLabel={placeholder}
      />
      <View className="flex-row items-center" style={{ gap: 8, minHeight: 36 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mention someone"
          hitSlop={8}
          onPress={() => fieldRef.current?.insertAt()}
          {...(Platform.OS === 'web'
            ? {
                onMouseDown: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                },
              }
            : null)}
          style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[16px] font-extrabold" style={{ color: THEME.accent }}>
            @
          </AppText>
        </Pressable>
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          disabled={!canSend || submitting}
          onPress={() => void submit()}
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: THEME.primary,
            opacity: !canSend || submitting ? 0.38 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
            {submitLabel}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
