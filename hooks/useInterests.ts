import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  INTEREST_ROOM_SLUGS,
  type InterestRoomSlug,
} from '@/lib/interestsCatalog';
import { type ChipStance, type RoomSaveAction, stateForSave } from '@/lib/interests';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

export type CatalogChipRow = {
  id: string;
  room_slug: InterestRoomSlug;
  slug: string;
  label: string;
  sort_order: number;
  allows_indoor_outdoor: boolean;
  rating_kind: string | null;
};

export type ProfileInterestRoomRow = {
  room_slug: InterestRoomSlug;
  state: 'incomplete' | 'complete_empty' | 'complete_filled';
  skipped_at: string | null;
};

export type ProfileInterestChipRow = {
  chip_id: string;
  excel: boolean;
  level_up: boolean;
  is_public: boolean;
  pinned: boolean;
  pin_rank: number | null;
  catalog?: CatalogChipRow | null;
};

export const interestsKeys = {
  catalog: ['interest-catalog'] as const,
  mine: (userId?: string) => ['interests', userId] as const,
};

async function fetchCatalog(): Promise<CatalogChipRow[]> {
  const { data, error } = await supabase
    .from('interest_chips')
    .select('id, room_slug, slug, label, sort_order, allows_indoor_outdoor, rating_kind')
    .order('sort_order', { ascending: true });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as CatalogChipRow[];
}

export function useInterestCatalog() {
  return useQuery({
    queryKey: interestsKeys.catalog,
    queryFn: fetchCatalog,
    staleTime: 60_000,
  });
}

export function useMyInterests() {
  const { user } = useAuth();
  const userId = user?.id;
  const catalog = useInterestCatalog();

  const mine = useQuery({
    queryKey: [...interestsKeys.mine(userId), catalog.dataUpdatedAt],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [rooms, chips, work, other] = await Promise.all([
        supabase.from('profile_interest_rooms').select('room_slug, state, skipped_at').eq('user_id', userId!),
        supabase
          .from('profile_interest_chips')
          .select('chip_id, excel, level_up, is_public, pinned, pin_rank')
          .eq('user_id', userId!),
        supabase.from('profile_work').select('occupation, employer').eq('user_id', userId!).maybeSingle(),
        supabase.from('interest_other_text').select('room_slug, raw_text').eq('user_id', userId!),
      ]);
      if (rooms.error) {
        throw new Error(getErrorMessage(rooms.error));
      }
      if (chips.error) {
        throw new Error(getErrorMessage(chips.error));
      }
      const catalogById = new Map((catalog.data ?? []).map((row) => [row.id, row]));
      return {
        rooms: (rooms.data ?? []) as ProfileInterestRoomRow[],
        chips: ((chips.data ?? []) as ProfileInterestChipRow[]).map((row) => ({
          ...row,
          catalog: catalogById.get(row.chip_id) ?? null,
        })),
        work: work.data as { occupation: string; employer: string } | null,
        other: (other.data ?? []) as { room_slug: InterestRoomSlug; raw_text: string }[],
      };
    },
  });

  return { catalog, mine, userId };
}

export function useSaveInterestRoom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useInterestCatalog();

  return useMutation({
    mutationFn: async (input: {
      room: InterestRoomSlug;
      action: RoomSaveAction;
      stances: Record<string, ChipStance>;
      otherText?: string;
      occupation?: string;
      employer?: string;
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const rows = (catalog.data ?? []).filter((row) => row.room_slug === input.room);
      const bySlug = new Map(rows.map((row) => [row.slug, row]));
      const selected = Object.entries(input.stances)
        .map(([slug, stance]) => {
          const chip = bySlug.get(slug);
          if (!chip) {
            return null;
          }
          return { chip, stance };
        })
        .filter(Boolean) as { chip: CatalogChipRow; stance: ChipStance }[];

      const state = stateForSave(input.action, selected.length);
      const skippedAt = input.action === 'skip' ? new Date().toISOString() : null;
      const completedAt =
        state === 'complete_empty' || state === 'complete_filled' ? new Date().toISOString() : null;

      const roomWrite = await supabase.from('profile_interest_rooms').upsert({
        user_id: user.id,
        room_slug: input.room,
        state,
        skipped_at: skippedAt,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      });
      if (roomWrite.error) {
        throw new Error(getErrorMessage(roomWrite.error));
      }

      const roomChipIds = rows.map((row) => row.id);
      const previousPins =
        input.action === 'save' && roomChipIds.length > 0
          ? await supabase
              .from('profile_interest_chips')
              .select('chip_id, is_public, pinned, pin_rank')
              .eq('user_id', user.id)
              .in('chip_id', roomChipIds)
          : { data: [] as { chip_id: string; is_public: boolean; pinned: boolean; pin_rank: number | null }[], error: null };
      if (previousPins.error) {
        throw new Error(getErrorMessage(previousPins.error));
      }
      const pinById = new Map(
        (previousPins.data ?? []).map((row) => [row.chip_id, row] as const),
      );

      if (input.action !== 'skip' && roomChipIds.length > 0) {
        const del = await supabase
          .from('profile_interest_chips')
          .delete()
          .eq('user_id', user.id)
          .in('chip_id', roomChipIds);
        if (del.error) {
          throw new Error(getErrorMessage(del.error));
        }
      }

      if (input.action === 'save' && selected.length > 0) {
        const insert = await supabase.from('profile_interest_chips').insert(
          selected.map((row) => {
            const prior = pinById.get(row.chip.id);
            return {
              user_id: user.id,
              chip_id: row.chip.id,
              excel: row.stance.excel,
              level_up: row.stance.levelUp,
              is_public: prior?.is_public ?? false,
              pinned: prior?.pinned ?? false,
              pin_rank: prior?.pinned ? prior.pin_rank : null,
            };
          }),
        );
        if (insert.error) {
          throw new Error(getErrorMessage(insert.error));
        }
      }

      const workChip = selected.find((row) => row.chip.slug === 'work');
      if (input.room === 'personal_development' && input.action !== 'skip') {
        if (workChip && input.action === 'save') {
          const occupation = String(input.occupation ?? '').trim();
          const employer = String(input.employer ?? '').trim();
          if (!occupation || !employer) {
            throw new Error('Add occupation and employer for Work.');
          }
          const workWrite = await supabase.from('profile_work').upsert({
            user_id: user.id,
            occupation,
            employer,
            updated_at: new Date().toISOString(),
          });
          if (workWrite.error) {
            throw new Error(getErrorMessage(workWrite.error));
          }
        } else {
          await supabase.from('profile_work').delete().eq('user_id', user.id);
        }
      }

      const otherChip = selected.find((row) => row.chip.slug === 'other');
      if (input.action === 'skip') {
        return;
      }
      if (input.action === 'save' && otherChip && String(input.otherText ?? '').trim()) {
        const otherWrite = await supabase.from('interest_other_text').upsert(
          {
            user_id: user.id,
            room_slug: input.room,
            raw_text: String(input.otherText ?? '').trim(),
          },
          { onConflict: 'user_id,room_slug' },
        );
        if (otherWrite.error) {
          throw new Error(getErrorMessage(otherWrite.error));
        }
      } else {
        await supabase.from('interest_other_text').delete().eq('user_id', user.id).eq('room_slug', input.room);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: interestsKeys.mine(user?.id) });
    },
  });
}

export function usePinInterestChip() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { chipId: string; pinned: boolean }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const existing = await supabase
        .from('profile_interest_chips')
        .select('chip_id, pin_rank')
        .eq('user_id', user.id)
        .eq('pinned', true);
      if (existing.error) {
        throw new Error(getErrorMessage(existing.error));
      }
      const pinnedRows = existing.data ?? [];
      let pinRank: number | null = null;
      if (input.pinned) {
        const already = pinnedRows.find((row) => row.chip_id === input.chipId);
        if (already?.pin_rank) {
          pinRank = already.pin_rank;
        } else {
          if (pinnedRows.length >= 8) {
            throw new Error('You can pin up to 8.');
          }
          const used = new Set(pinnedRows.map((row) => row.pin_rank).filter(Boolean));
          pinRank = 1;
          while (used.has(pinRank) && pinRank <= 8) {
            pinRank += 1;
          }
        }
      }
      const patch = await supabase
        .from('profile_interest_chips')
        .update({
          pinned: input.pinned,
          pin_rank: pinRank,
          is_public: false,
        })
        .eq('user_id', user.id)
        .eq('chip_id', input.chipId);
      if (patch.error) {
        if (String(patch.error.message ?? '').includes('PIN_CAP')) {
          throw new Error('You can pin up to 8.');
        }
        throw new Error(getErrorMessage(patch.error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: interestsKeys.mine(user?.id) });
    },
  });
}

export function interestRoomStates(
  rows: ProfileInterestRoomRow[] | undefined,
): Partial<Record<InterestRoomSlug, ProfileInterestRoomRow['state']>> {
  const next: Partial<Record<InterestRoomSlug, ProfileInterestRoomRow['state']>> = {};
  for (const slug of INTEREST_ROOM_SLUGS) {
    next[slug] = 'incomplete';
  }
  for (const row of rows ?? []) {
    next[row.room_slug] = row.state;
  }
  return next;
}
