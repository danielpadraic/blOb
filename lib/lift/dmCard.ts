import { buildRecap, recapFallbackText } from '@/lib/lift/recap';
import { buildLiftSnapshot, type LiftShareSnapshot } from '@/lib/lift/snapshot';
import type { LiftSessionDraft } from '@/lib/lift/types';

/**
 * A lift in a DM is a card in that thread.
 * It is not a Home post, and it is not an "Open this post" link.
 */
export type LiftDmPayload = {
  v: 1;
  sessionId: string;
  authorId: string;
  caption: string;
  snapshot: LiftShareSnapshot;
};

export function buildLiftDmBody(input: {
  draft: LiftSessionDraft;
  authorId: string;
  caption?: string | null;
}): string {
  const caption = String(input.caption ?? '').trim();
  const payload: LiftDmPayload = {
    v: 1,
    sessionId: input.draft.id,
    authorId: input.authorId,
    caption,
    snapshot: buildLiftSnapshot(input.draft),
  };
  const readable = [caption, recapFallbackText(buildRecap(input.draft))].filter(Boolean).join('\n');
  return `${readable}\nlift-card:${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseLiftDmBody(text: string | null | undefined): LiftDmPayload | null {
  const match = String(text ?? '').match(/lift-card:(\S+)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeURIComponent(match[1])) as LiftDmPayload;
    if (!payload || payload.v !== 1 || !payload.sessionId || !payload.snapshot) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function sendLiftCardToThreads(input: {
  draft: LiftSessionDraft;
  authorId: string;
  caption?: string | null;
  recipientIds: readonly string[];
  startChat: (friendId: string) => Promise<{ id: string }>;
  startGroup: (friendIds: string[]) => Promise<{ id: string }>;
  send: (message: { conversation_id: string; body: string }) => Promise<void>;
}): Promise<number> {
  const body = buildLiftDmBody(input);
  const recipients = [...new Set(input.recipientIds.filter(Boolean))];
  if (!input.authorId || recipients.length === 0) {
    return 0;
  }
  if (recipients.length > 1) {
    try {
      const conversation = await input.startGroup(recipients);
      await input.send({ conversation_id: conversation.id, body });
      return recipients.length;
    } catch (error) {
      console.warn('Could not open a group for the lift, sending one by one', error);
    }
  }
  let sent = 0;
  for (const friendId of recipients) {
    try {
      const conversation = await input.startChat(friendId);
      await input.send({ conversation_id: conversation.id, body });
      sent += 1;
    } catch (error) {
      console.warn('Could not send the lift in a DM', error);
    }
  }
  return sent;
}
