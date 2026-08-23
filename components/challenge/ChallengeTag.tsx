import { View } from 'react-native';

import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  CHALLENGE_TAG_TOKENS,
  type ChallengeTagKind,
  type ChallengeTagSpec,
  type ChallengeTagToken,
} from '@/lib/challengeTags';

type ChallengeTagProps = {
  kind: ChallengeTagKind;
  label: string;
  tone?: 'light' | 'dark';
};

const DARK_TAG_TOKENS: Partial<Record<ChallengeTagKind, ChallengeTagToken>> = {
  official: { bg: '#101312', fg: '#FFFFFF' },
  public: { bg: 'rgba(255,255,255,0.14)', fg: '#F7FFFC' },
  private: { bg: 'rgba(255,255,255,0.14)', fg: '#F7FFFC' },
};

const TAG_GLYPH: Partial<Record<ChallengeTagKind, GlyphId>> = {
  official: GLYPH.shield,
  public: GLYPH.globe,
  private: GLYPH.shield,
  hosting: GLYPH.people,
  consistency: GLYPH.star,
  filling: GLYPH.sparkle,
  arming: GLYPH.clock,
  coins: GLYPH.sparkle,
  joined: GLYPH.check,
  invited: GLYPH.bell,
  points: GLYPH.sparkle,
};

export function ChallengeTag({ kind, label, tone = 'light' }: ChallengeTagProps) {
  const token = (tone === 'dark' && DARK_TAG_TOKENS[kind]) || CHALLENGE_TAG_TOKENS[kind];
  const glyph = TAG_GLYPH[kind];
  return (
    <View
      className="flex-row items-center self-start rounded-full"
      style={{
        backgroundColor: token.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
        borderWidth: kind === 'official' && tone === 'dark' ? 1 : 0,
        borderColor: '#FFFFFF',
      }}>
      {kind === 'live' ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: token.fg,
          }}
        />
      ) : glyph ? (
        <Glyph name={glyph} color={token.fg} size={10} />
      ) : null}
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

export function ChallengeTagRow({
  tags,
  tone = 'light',
}: {
  tags: ChallengeTagSpec[];
  tone?: 'light' | 'dark';
}) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 5 }}>
      {tags.map((tag) => (
        <ChallengeTag
          key={`${tag.kind}-${tag.label}`}
          kind={tag.kind}
          label={tag.label}
          tone={tone}
        />
      ))}
    </View>
  );
}
