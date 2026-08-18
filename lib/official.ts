/** Official powers come only from profiles.is_official. Username is not a privilege. */
export function isOfficialAccount(
  profile?: { is_official?: boolean | null } | null,
): boolean {
  return Boolean(profile?.is_official);
}
