const CHALLENGE_UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CHALLENGE_PATH = new RegExp(`challenges\\/(${CHALLENGE_UUID})`, 'i');
const CHALLENGE_TOKEN = new RegExp(
  `(?:blob:\\/{2,3}\\S*|https?:\\/\\/\\S+)?challenges\\/${CHALLENGE_UUID}[^\\s]*`,
  'gi',
);

/** blob://challenges/{id} and https://blob.mobi/challenges/{id} (and host variants). */
export function challengeIdFromShareText(text: string): string | null {
  const match = String(text ?? '').match(CHALLENGE_PATH);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Body with the challenge URL stripped. Empty when the bubble was only the link. */
export function textWithoutChallengeLinks(text: string): string {
  return String(text ?? '')
    .replace(CHALLENGE_TOKEN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
