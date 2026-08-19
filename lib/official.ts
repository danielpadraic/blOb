/** Official Bob / @blob. Powers come from profiles.is_official, not username. */
export const OFFICIAL_BOB_ID = '81dfe427-d413-4c60-bd4a-e710c95077ad';

/** Official powers come only from profiles.is_official. Username is not a privilege. */
export function isOfficialAccount(
  profile?: { is_official?: boolean | null } | null,
): boolean {
  return Boolean(profile?.is_official);
}
