import { describe, expect, it } from 'vitest';

import {
  buildAliases,
  exerciseNameTaken,
  exerciseSlug,
  officialCatalogCounts,
  OFFICIAL_EXERCISES,
  searchExercises,
  touchesMuscle,
  type ExerciseOption,
} from '@/lib/lift/catalog';
import { MUSCLE_KEYS, type MuscleKey } from '@/lib/lift/muscles';

const custom = (name: string, muscle: MuscleKey): ExerciseOption => ({
  id: `custom-${exerciseSlug(name)}`,
  name,
  muscle,
  secondaries: [],
  aliases: [],
  official: false,
});

describe('the official catalog', () => {
  it('gives every row a unique slug', () => {
    const ids = new Set(OFFICIAL_EXERCISES.map((row) => row.id));
    expect(ids.size).toBe(OFFICIAL_EXERCISES.length);
  });

  it('only uses known muscle keys', () => {
    for (const row of OFFICIAL_EXERCISES) {
      expect(MUSCLE_KEYS).toContain(row.muscle);
      for (const secondary of row.secondaries) {
        expect(MUSCLE_KEYS).toContain(secondary);
        expect(secondary).not.toBe(row.muscle);
      }
    }
  });

  it('is deep enough for the big groups and stocked for the rest', () => {
    const counts = officialCatalogCounts();
    for (const muscle of ['chest', 'back', 'shoulders', 'quads'] as const) {
      expect(counts[muscle]).toBeGreaterThanOrEqual(80);
    }
    for (const muscle of MUSCLE_KEYS) {
      expect(counts[muscle]).toBeGreaterThanOrEqual(35);
    }
  });
});

describe('abbreviation aliases', () => {
  it('expands gym shorthand both ways', () => {
    expect(buildAliases('Incline BB Bench Press')).toContain('incline barbell bench press');
    expect(buildAliases('Flat DB Bench Press')).toContain('flat dumbbell bench press');
    expect(buildAliases('Incline SM Bench Press')).toContain('incline smith bench press');
  });

  it('finds an exercise by its expanded name', () => {
    const hits = searchExercises({ query: 'incline barbell bench', muscles: ['chest'] });
    expect(hits.map((row) => row.name)).toContain('Incline BB Bench Press');
  });
});

describe('typeahead', () => {
  it('suggests from one character', () => {
    const hits = searchExercises({ query: 'b', muscles: ['chest'] });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('filters to the picked muscles', () => {
    const hits = searchExercises({ query: 'curl', muscles: ['chest'] });
    expect(hits.some((row) => row.name === 'BB Curl')).toBe(false);
  });

  it('keeps a tagged exercise under every muscle it touches', () => {
    const closeGrip = OFFICIAL_EXERCISES.find(
      (row) => row.name === 'Close-Grip BB Bench Press',
    );
    expect(closeGrip).toBeDefined();
    expect(touchesMuscle(closeGrip!, 'triceps')).toBe(true);
    expect(touchesMuscle(closeGrip!, 'chest')).toBe(true);

    for (const muscle of ['triceps', 'chest', 'shoulders'] as const) {
      const hits = searchExercises({ query: 'close grip bench', muscles: [muscle] });
      expect(hits.map((row) => row.name)).toContain('Close-Grip BB Bench Press');
    }
  });

  it('puts the plain movement above its variations', () => {
    const hits = searchExercises({ query: 'back squat', muscles: ['quads'] });
    expect(hits[0]?.name).toBe('Back Squat');
  });

  it('lists the user’s own exercises first', () => {
    const hits = searchExercises({
      query: 'floor press',
      muscles: ['chest'],
      customs: [custom('Floor press', 'chest')],
    });
    expect(hits[0]?.official).toBe(false);
    expect(hits[0]?.name).toBe('Floor press');
  });

  it('shows something for an empty query so the sheet is never blank', () => {
    const hits = searchExercises({ query: '', muscles: ['biceps'] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((row) => row.muscle === 'biceps')).toBe(true);
  });
});

describe('creating a custom exercise', () => {
  it('refuses to duplicate a catalog name', () => {
    expect(exerciseNameTaken('Back Squat')).toBe(true);
    expect(exerciseNameTaken('back  squat')).toBe(true);
  });

  it('refuses to duplicate one the user already made', () => {
    expect(exerciseNameTaken('Floor press', [custom('Floor Press', 'chest')])).toBe(true);
  });

  it('allows a genuinely new name', () => {
    expect(exerciseNameTaken('Harder Press 3000')).toBe(false);
  });
});
