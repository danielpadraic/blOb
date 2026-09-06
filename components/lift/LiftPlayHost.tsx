import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { LiftPlayOverlay } from '@/components/lift/LiftPlayOverlay';
import { blocksFromRounds, playBlocks, type LiftPlaySpec } from '@/lib/lift/rounds';
import { timedRowLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftRound } from '@/lib/lift/types';

/**
 * Hosts the Play timer above every piece of app chrome.
 *
 * The timer cannot live inside the Logging screen. That screen renders inside the tab navigator's
 * `overflow: 'hidden'` container, which clips an absolutely positioned child on native — so an
 * in-screen overlay leaves the header wallet, the bell, and the floating tab bar sitting on top of
 * a full-screen clock. Rendering from the root of the tab layout is what makes "Play takes the
 * whole screen" true on iOS and Android and not just on web, where `position: fixed` escapes.
 *
 * Same approach as `MediaLightboxHost`: a context to open it from anywhere, one overlay at the
 * root. Both a cardio row and the standalone timer open it, which is why it takes a play spec
 * rather than an exercise. The timer's own state lives in `LiftPlayOverlay`, which mounts and
 * unmounts with the spec.
 */

type LiftPlayValue = {
  startPlay: (spec: LiftPlaySpec) => void;
  stopPlay: () => void;
  playing: boolean;
};

const LiftPlayContext = createContext<LiftPlayValue | null>(null);

export function useLiftPlay(): LiftPlayValue {
  const value = useContext(LiftPlayContext);
  if (!value) {
    throw new Error('useLiftPlay must be used inside LiftPlayHost');
  }
  return value;
}

export function LiftPlayHost({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<LiftPlaySpec | null>(null);

  // The blocks arrive already flattened, which makes the spec a snapshot by construction: the
  // timer runs the rounds as they were when Play was pressed, and Logging keeps autosaving
  // underneath without ever restarting the clock.
  const startPlay = useCallback((next: LiftPlaySpec) => setSpec(next), []);

  const stopPlay = useCallback(() => setSpec(null), []);

  const value = useMemo(
    () => ({ startPlay, stopPlay, playing: Boolean(spec) }),
    [spec, startPlay, stopPlay],
  );

  return (
    <LiftPlayContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {spec ? (
          <View style={styles.layer} pointerEvents="auto">
            <LiftPlayOverlay spec={spec} onClose={stopPlay} />
          </View>
        ) : null}
      </View>
    </LiftPlayContext.Provider>
  );
}

/** The play spec for a cardio row, so callers do not each re-derive the title and the blocks. */
export function rowPlaySpec(row: LiftExerciseDraft): LiftPlaySpec {
  return { title: timedRowLabel(row), blocks: playBlocks(row) };
}

/** The play spec for a bare rounds list — the standalone timer, which has no exercise behind it. */
export function rowPlaySpecFromRounds(rounds: readonly LiftRound[], title: string): LiftPlaySpec {
  return { title, blocks: blocksFromRounds(rounds) };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Above the create tour, the highest layer in the tab chrome. Nothing should sit over a
    // running clock, and nothing behind it should be reachable by a stray thumb mid-sprint.
    zIndex: 5000,
    elevation: 5000,
  },
});
