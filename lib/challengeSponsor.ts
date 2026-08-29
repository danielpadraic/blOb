const UNNAMED_SPONSORS = new Set(['blob', 'official']);

function cleanName(value?: string | null): string {
  const name = value?.trim() ?? '';
  if (!name || UNNAMED_SPONSORS.has(name.toLowerCase())) {
    return '';
  }
  return name;
}

export function namedOfficialSponsor(challenge: {
  sponsor_name?: string | null;
  organization_name?: string | null;
  organization?: string | null;
} | null | undefined): string {
  return (
    cleanName(challenge?.sponsor_name) ||
    cleanName(challenge?.organization_name) ||
    cleanName(challenge?.organization)
  );
}

export function officialSponsorName(challenge: {
  sponsor_name?: string | null;
  organization_name?: string | null;
  organization?: string | null;
  is_official?: boolean | null;
} | null | undefined): string {
  const named = namedOfficialSponsor(challenge);
  if (named) {
    return named;
  }
  return challenge?.is_official ? 'blOb' : '';
}

export function isDefaultOfficialSponsor(name: string): boolean {
  return UNNAMED_SPONSORS.has(name.trim().toLowerCase());
}
