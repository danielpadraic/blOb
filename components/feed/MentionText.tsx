import { usePathname, useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { splitMentionedText, type MentionRecord } from '@/lib/mentions';
import { challengeDetailHref, circleDetailHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

type MentionTextProps = {
  content: string;
  mentions?: MentionRecord[];
  numberOfLines?: number;
  className?: string;
};

export function MentionText({ content, mentions = [], numberOfLines, className }: MentionTextProps) {
  const router = useRouter();
  const pathname = usePathname();
  const parts = splitMentionedText(content, mentions);
  return (
    <AppText className={className ?? 'text-[14px] leading-[20px] text-ink'} numberOfLines={numberOfLines}>
      {parts.map((part, index) => {
        const mention = part.mention;
        if (part.type !== 'mention' || !mention) {
          return <AppText key={`${index}-${part.value}`}>{part.value}</AppText>;
        }
        const kind = mention.kind ?? 'user';
        if (kind === 'user' && !mention.available) {
          return <AppText key={`${index}-${part.value}`}>{part.value}</AppText>;
        }
        const color = kind === 'circle' ? THEME.circle : THEME.accent;
        return (
          <AppText
            key={`${index}-${mention.userId}`}
            accessibilityRole="link"
            onPress={() => {
              if (kind === 'circle') {
                router.push(circleDetailHref(mention.userId, { tab: 'details' }));
                return;
              }
              if (kind === 'challenge') {
                router.push(challengeDetailHref(mention.userId, 'feed'));
                return;
              }
              router.push(profileHref(pathname, mention.username));
            }}
            style={{ color, fontWeight: '700' }}>
            {part.value}
          </AppText>
        );
      })}
    </AppText>
  );
}

function profileHref(pathname: string, handle: string) {
  if (pathname.startsWith('/challenges')) {
    return { pathname: '/challenges/u/[username]' as const, params: { username: handle } };
  }
  if (pathname.startsWith('/profile')) {
    return { pathname: '/profile/u/[username]' as const, params: { username: handle } };
  }
  if (pathname.startsWith('/friends') || pathname.startsWith('/messages')) {
    return { pathname: '/friends/u/[username]' as const, params: { username: handle } };
  }
  return { pathname: '/feed/u/[username]' as const, params: { username: handle } };
}
