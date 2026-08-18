import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { handleEnterToSubmit } from '@/utils/keyboard';

type InlineComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (content: string) => Promise<unknown> | void;
};

export function InlineComposer({
  placeholder = 'Write a reply…',
  submitting,
  submitLabel = 'Reply',
  onSubmit,
}: InlineComposerProps) {
  const [draft, setDraft] = useState('');

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed || submitting) {
      return;
    }
    await onSubmit(trimmed);
    setDraft('');
  }

  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          multiline
          blurOnSubmit={false}
          className="py-2"
          style={{ minHeight: 40, paddingVertical: 8 }}
          onKeyPress={(event) => handleEnterToSubmit(event, () => void submit())}
          accessibilityLabel={placeholder}
        />
      </View>
      <Button
        title={submitLabel}
        size="sm"
        loading={submitting}
        disabled={!draft.trim()}
        onPress={() => void submit()}
      />
    </View>
  );
}
