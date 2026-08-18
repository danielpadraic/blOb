import { isCreatorAccount } from '@/lib/creator';

export type ProfileWallHost = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  allow_profile_posts?: boolean | null;
  profile_visibility?: string | null;
  is_creator?: boolean | null;
};

export function canPostOnProfile(input: {
  viewerId?: string | null;
  host: ProfileWallHost | null | undefined;
  friends: boolean;
  followingCreator: boolean;
  blocked: boolean;
}): boolean {
  const viewerId = input.viewerId;
  const host = input.host;
  if (!viewerId || !host?.id || viewerId === host.id) {
    return false;
  }
  if (input.blocked) {
    return false;
  }
  if (String(host.profile_visibility ?? 'public') !== 'public') {
    return false;
  }
  if (host.allow_profile_posts === false) {
    return false;
  }
  if (input.friends) {
    return true;
  }
  return input.followingCreator && isCreatorAccount(host);
}

export function wallHostLabel(host: { display_name?: string | null; username?: string | null } | null | undefined) {
  return host?.display_name?.trim() || host?.username?.trim() || 'this blob';
}
