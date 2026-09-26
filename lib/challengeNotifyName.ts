import { rewriteUserAlert } from '@/lib/alertCopy';

export type ChallengeNameKind = 'your' | 'the';

const NAMED_PREFIX = /(?:Your|The) Challenge:\s*["“]/;
const LQ = '\u201c';
const RQ = '\u201d';

function clipInside(title: string, max: number): string {
  const trimmed = String(title ?? '').trim() || 'this challenge';
  if (trimmed.length <= max) {
    return trimmed;
  }
  if (max <= 1) {
    return '…';
  }
  return `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Title inside quotes. Ellipsis stays inside the quotes. */
export function quotedChallengeTitle(title: string, maxInside = 48): string {
  return `${LQ}${clipInside(title, maxInside)}${RQ}`;
}

/** Bare challenge title. Alerts name the room, then the action. */
export function namedChallengePhrase(
  title: string,
  _kind: ChallengeNameKind = 'your',
  maxPhrase = 80,
): string {
  return clipInside(title, maxPhrase);
}

export function notificationChallengeKind(type?: string | null): ChallengeNameKind {
  const value = String(type ?? '');
  if (value === 'friend_challenge' || value === 'official_started') {
    return 'the';
  }
  return 'your';
}

export function clipPushLine(text: string, max = 140): string {
  const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) {
    return cleaned;
  }
  if (max <= 1) {
    return '…';
  }
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Bell / push: no Chicago clocks, no period keys, no nameless “window.” */
export function stripAlertJargon(text: string): string {
  return String(text ?? '')
    .replace(/\bChicago day\b/gi, 'today')
    .replace(/\bfirst open of the\b/gi, '')
    .replace(/\bAmerica\/Chicago\b/gi, '')
    .replace(/\bhost tz\b/gi, '')
    .replace(/\bUTC day\b/gi, 'today')
    .replace(/\bperiod_key\b/gi, '')
    .replace(/\btoday['’]s window\b/gi, 'today')
    .replace(/\bbefore the window ends\b/gi, 'before tonight')
    .replace(/\bbefore the window\b/gi, 'today')
    .replace(/\bthe window on\b/gi, 'today on')
    .replace(/\bthe window\b/gi, 'today')
    .replace(/\bSame window\b/g, 'Same check-in')
    .replace(/\bthe field\b/gi, 'this challenge')
    .replace(/\bthe work\b/gi, 'the check-in')
    .replace(/\s+/g, ' ')
    .trim();
}

function swapBareTitle(text: string, bare: string, phrase: string): string {
  if (!text || !bare) {
    return text;
  }
  if (NAMED_PREFIX.test(text)) {
    return text;
  }
  if (text.includes(`@${bare}`)) {
    return text.split(`@${bare}`).join(phrase);
  }
  if (text.includes(bare)) {
    return text.split(bare).join(phrase);
  }
  return text;
}

export function formatNotificationCopy(input: {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  challengeTitle?: string | null;
  actorName?: string | null;
  tone?: string | null;
  offsetHours?: number | null;
  category?: string | null;
}): { title: string; body: string | null } {
  const rewritten = rewriteUserAlert(input);
  if (rewritten) {
    return { title: clipPushLine(rewritten, 100), body: null };
  }
  const kind = notificationChallengeKind(input.type);
  const bare = String(input.challengeTitle ?? '').trim();
  let title = stripAlertJargon(String(input.title ?? ''));
  let body = input.body == null || input.body === '' ? null : stripAlertJargon(String(input.body));

  if (title && body && title === body) {
    body = null;
  }

  if (bare) {
    const phrase = namedChallengePhrase(bare, kind);
    const startMoved = /start moved/i.test(`${title} ${body ?? ''}`) || input.type === 'start_rolled';
    if (startMoved) {
      const when = `${title} ${body ?? ''}`.match(/Start moved to ([^.]+)/i)?.[1]?.trim();
      return {
        title: clipPushLine(`${phrase}: not enough people yet.`, 100),
        body: when ? `Start moved to ${when}.` : 'Start moved.',
      };
    }
    title = swapBareTitle(title, bare, phrase);
    if (body) {
      body = swapBareTitle(body, bare, phrase);
    }
    if (title && body && title === body) {
      body = null;
    }
  }

  return {
    title: clipPushLine(title, 100),
    body: body == null ? null : clipPushLine(body, 100),
  };
}
