/** Creator Follow is a paid flag. Billing is not wired, so nobody is a Creator. */
export function isCreatorAccount(_profile?: { is_creator?: boolean | null } | null): boolean {
  return false;
}
