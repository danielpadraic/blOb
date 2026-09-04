import { mediaKind } from '@/utils/media';

const CHECKIN_KINDS = new Set(['check_in', 'checkin', 'workout', 'proof', 'challenge_log']);

const AUTO_CAPTION = [
  /^checked in\.?$/i,
  /^checked in today\b/i,
  /^checked in today for the .+/i,
  /^logged today'?s work\.?$/i,
  /^check-in complete\.?$/i,
  /^started check-in\.?$/i,
  /^.+ is .+!$/,
  /^.+ checked in for .+\.?$/i,
  /^.+ was exercising\b/i,
  /^added (a |an |the )?(photo|video|pre-workout selfie|post-workout selfie|heart-rate proof|check-in note)\.?$/i,
];

export type CheckinPostLike = {
  source?: string | null;
  checkin_id?: string | null;
  checkin_stage?: string | null;
  challenge_id?: string | null;
  media_urls?: string[] | null;
  kind?: string | null;
  type?: string | null;
  hidden_from_home?: boolean | null;
};

export function looksLikeProofMedia(urls?: string[] | null): boolean {
  const visuals = (urls ?? []).filter((url) => {
    if (!url) {
      return false;
    }
    const kind = mediaKind(url);
    return kind === 'image' || kind === 'video';
  });
  return visuals.length >= 2 && visuals.length <= 3;
}

/** Check-in / workout proof post. Reuses source, checkin_id, and proof media — no parallel kind.
 *  hidden_from_home only mutes the Home card. It does not change this, or board / ring counts. */
export function isCheckinPost(post: CheckinPostLike): boolean {
  const kind = String(post.kind ?? post.type ?? '').toLowerCase();
  if (CHECKIN_KINDS.has(kind)) {
    return true;
  }
  if (post.source === 'checkin') {
    return true;
  }
  if (post.checkin_id || (post.checkin_stage && post.checkin_stage.trim())) {
    return true;
  }
  return Boolean(post.challenge_id && looksLikeProofMedia(post.media_urls));
}

function stripEmoji(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop the auto “Checked in today for the …” line so the teal tag can own that copy. */
export function isCheckinCompleteStage(stage?: string | null): boolean {
  const value = String(stage ?? '').toLowerCase();
  return value === 'complete' || value === 'submitted';
}

export function checkinExtraCaption(
  content: string | null | undefined,
  challengeTitle?: string | null,
): string {
  const text = content?.trim() ?? '';
  if (!text) {
    return '';
  }
  const withoutTitle = text.replace(/^check-in complete\.?\s*/i, '').trim();
  if (!withoutTitle) {
    return '';
  }
  const plain = stripEmoji(withoutTitle);
  if (AUTO_CAPTION.some((pattern) => pattern.test(plain))) {
    return '';
  }
  const title = challengeTitle?.trim();
  if (title) {
    const lower = plain.toLowerCase();
    if (lower === `checked in today for the ${title}`.toLowerCase()) {
      return '';
    }
    if (lower === `checked in for ${title}.`.toLowerCase()) {
      return '';
    }
  }
  return withoutTitle;
}

/** After an owner edit, show the saved caption as stored. */
export function checkinCardCaption(
  content: string | null | undefined,
  challengeTitle?: string | null,
  editedAt?: string | null,
): string {
  if (editedAt) {
    return content?.trim() ?? '';
  }
  return checkinExtraCaption(content, challengeTitle);
}

/** City / locality when the post already carries it. Omit missing or “Unknown”. */
export function postLocality(post: object): string | null {
  const raw = post as Record<string, unknown>;
  const candidates = [raw.location_name, raw.city, raw.locality];
  for (const value of candidates) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || /^unknown$/i.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return null;
}
