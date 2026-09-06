/**
 * Reading a shared post link out of plain text.
 *
 * A DM carries text and one photo and nothing else, so a shared post — a lift card, a check-in —
 * arrives as a URL in the message body. These let a bubble open that post instead of showing the
 * reader a bare URL to squint at.
 *
 * Kept apart from `postShare` because that module builds links through `expo-linking`, and reading
 * one back is pure string work that should stay testable on its own.
 */

const POST_LINK =
  /(?:\S*\/)?feed\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\S*/i;

/** The post a shared link points at, or null when the text is just text. */
export function postIdFromShareText(text: string): string | null {
  return text.match(POST_LINK)?.[1] ?? null;
}

/** The same text with the link removed, leaving whatever the sender actually typed. */
export function textWithoutPostLink(text: string): string {
  return text.replace(POST_LINK, '').replace(/\n{2,}/g, '\n').trim();
}
