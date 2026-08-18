import { useState } from 'react';
import { View } from 'react-native';

import { MentionField } from '@/components/feed/MentionField';
import { Button } from '@/components/ui/Button';
import type { MentionDoc } from '@/lib/mentions';
import type { PostAudience } from '@/lib/postAudience';

type InlineComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  submitLabel?: string;
  audience?: PostAudience | string;
  audienceUserIds?: string[];
  onSubmit: (content: string, mentionedUserIds: string[]) => Promise<unknown> | void;
};

export function InlineComposer({
  placeholder = 'Write a reply…',
  submitting,
  submitLabel = 'Reply',
  audience = 'public',
  audienceUserIds = [],
  onSubmit,
}: InlineComposerProps) {
  const [doc, setDoc] = useState<MentionDoc>({ text: '', chips: [] });

  async function submit() {
    const trimmed = doc.text.trim();
    if (!trimmed || submitting) {
      return;
    }
    await onSubmit(
      trimmed,
      doc.chips.map((chip) => chip.userId),
    );
    setDoc({ text: '', chips: [] });
  }

  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <MentionField
          placeholder={placeholder}
          audience={audience}
          audienceUserIds={audienceUserIds}
          onChange={setDoc}
          onSubmit={() => void submit()}
          accessibilityLabel={placeholder}
        />
      </View>
      <Button
        title={submitLabel}
        size="sm"
        loading={submitting}
        disabled={!doc.text.trim()}
        onPress={() => void submit()}
      />
    </View>
  );
}
