import { useEffect, useState } from 'react';

import { parseProofParts } from '@/lib/challengeProofs';
import { parseCheckinHealthProof, type CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { supabase } from '@/lib/supabase';

/**
 * The full session summary behind a posted check-in, for the one viewer who is allowed to see it.
 *
 * The post itself carries display-safe numbers (`posts.checkin_stats`), which is what every viewer
 * gets. The GPS track and the workout's real wall clock live on `challenge_checkins.proof_parts`, and
 * that table is readable only by participants of that challenge. So this is an upgrade, not a
 * requirement: a participant's card gains its map and its start-end times, and everyone else keeps
 * the card built from the post. A denied read is indistinguishable from a check-in with no route, and
 * both simply leave the card as it was.
 *
 * Fetched when a card is opened rather than for every post in the feed: a route is a few hundred
 * coordinates, and pulling one per workout post would put all of them on the wire to draw maps too
 * small to read.
 */
const cache = new Map<string, CheckinHealthProof | null>();

function cached(checkinId?: string | null): CheckinHealthProof | null {
  const id = String(checkinId ?? '').trim();
  return id ? cache.get(id) ?? null : null;
}

export function useCheckinHealthSnapshot(checkinId?: string | null): CheckinHealthProof | null {
  const id = String(checkinId ?? '').trim();
  const [snapshot, setSnapshot] = useState<CheckinHealthProof | null>(() => cached(id));

  useEffect(() => {
    if (!id) {
      setSnapshot(null);
      return;
    }
    // A miss and a stored null are different: null is a check-in already known to have nothing to
    // add, and asking again would repeat a read that can only fail the same way.
    if (cache.has(id)) {
      setSnapshot(cache.get(id) ?? null);
      return;
    }
    let live = true;
    void (async () => {
      let found: CheckinHealthProof | null = null;
      try {
        const { data } = await supabase
          .from('challenge_checkins')
          .select('proof_parts')
          .eq('id', id)
          .maybeSingle();
        for (const part of Object.values(parseProofParts(data?.proof_parts))) {
          const health = parseCheckinHealthProof(part.health);
          if (health) {
            found = health;
            break;
          }
        }
      } catch {
        found = null;
      }
      cache.set(id, found);
      if (live) {
        setSnapshot(found);
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  return snapshot;
}
