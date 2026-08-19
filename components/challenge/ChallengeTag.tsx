import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  CHALLENGE_TAG_TOKENS,
  type ChallengeTagKind,
  type ChallengeTagSpec,
} from '@/lib/challengeTags';

type ChallengeTagProps = {
  kind: ChallengeTagKind;
  label: string;
};

export function ChallengeTag({ kind, label }: ChallengeTagProps) {
  const token = CHALLENGE_TAG_TOKENS[kind];
  return (
    <View
      className="self-start rounded-full"
      style={{
        backgroundColor: token.bg,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}>
      <AppText
        className="text-[9px] font-extrabold uppercase"
        style={{
          color: token.fg,
          letterSpacing: 0.35,
          lineHeight: 11,
        }}>
        {label}
      </AppText>
    </View>
  );
}

export function ChallengeTagRow({ tags }: { tags: ChallengeTagSpec[] }) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 4 }}>
      {tags.map((tag) => (
        <ChallengeTag key={`${tag.kind}-${tag.label}`} kind={tag.kind} label={tag.label} />
      ))}
    </View>
  );
}
