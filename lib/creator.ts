/** Creator Follow is a paid flag. Only accounts with is_creator are Creators. */
export function isCreatorAccount(profile?: { is_creator?: boolean | null } | null): boolean {
  return Boolean(profile?.is_creator);
}
