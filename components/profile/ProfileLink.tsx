import type { ReactNode } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, type PressableProps } from 'react-native';

type ProfileLinkProps = Omit<PressableProps, 'onPress'> & {
  username?: string | null;
  userId?: string | null;
  children: ReactNode;
};

export function ProfileLink({ username, userId, children, ...props }: ProfileLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const handle = username?.trim() || userId?.trim();

  if (!handle) {
    return <>{children}</>;
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(profileHref(pathname, handle))}
      {...props}>
      {children}
    </Pressable>
  );
}

function profileHref(pathname: string, handle: string): Href {
  if (pathname.startsWith('/challenges')) {
    return { pathname: '/challenges/u/[username]', params: { username: handle } };
  }
  if (pathname.startsWith('/profile')) {
    return { pathname: '/profile/u/[username]', params: { username: handle } };
  }
  return { pathname: '/feed/u/[username]', params: { username: handle } };
}
