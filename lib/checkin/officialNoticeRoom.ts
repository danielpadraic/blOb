import { postSendNotice } from '@/lib/checkin/sendNotice';
import { supabase } from '@/lib/supabase';

type RoomRow = { id?: string | null; official_kind?: string | null };

let knownRooms: RoomRow[] = [];

/**
 * Official Fitness is one Live on the weekly host. A notice for the monthly scoring room would wait
 * forever on a Live nobody can open, so it goes to the weekly host instead.
 *
 * Returns the room whose Live should show the line:
 *   - a monthly id → the weekly host id (null when the host is not known, never the monthly id)
 *   - anything else → the same id
 */
export function officialNoticeRoomId(
  challengeId: string | null | undefined,
  rooms: readonly RoomRow[],
): string | null {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return null;
  }
  const row = rooms.find((room) => String(room.id ?? '').trim() === id);
  if (row?.official_kind !== 'coin_monthly') {
    return id;
  }
  const host = rooms.find((room) => room.official_kind === 'coin_weekly');
  const hostId = String(host?.id ?? '').trim();
  return hostId && hostId !== id ? hostId : null;
}

async function loadOfficialRooms(): Promise<RoomRow[]> {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('id, official_kind')
      .not('official_kind', 'is', null);
    if (!error && Array.isArray(data) && data.length > 0) {
      knownRooms = data as RoomRow[];
    }
  } catch {
    // Keep the last pair we saw.
  }
  return knownRooms;
}

/** One-line notice for work that ends after Send left. Lands on the weekly host for Official. */
export async function postSendNoticeToLive(
  challengeId: string | null | undefined,
  line: string,
): Promise<void> {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return;
  }
  const rooms = await loadOfficialRooms();
  const room = officialNoticeRoomId(id, rooms);
  if (room) {
    postSendNotice(room, line);
  }
}
