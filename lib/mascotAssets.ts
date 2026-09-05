/**
 * Single source for the 3D Bob character art.
 *
 * Every UI surface that draws the 3D character — login / AuthShell hero, empty, loading and error
 * states, Official lobby art, and any flattened card that stamps Bob — imports from here so the
 * path cannot drift back to a non-transparent copy.
 *
 * blob-wave-sticker.png is RGBA with real transparency. An RGB copy with a baked-in background
 * renders as a grey or black slab wherever it is placed on a dark field, which is exactly the bug
 * this helper exists to prevent.
 */
export const BLOB_WAVE_STICKER = require('@/assets/mascot/blob-wave-sticker.png');

/**
 * The blOb wordmark. Not the character — do not swap this for the sticker.
 */
export const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');

/**
 * Compositors must never silently fall back to another mascot file. A missing sticker should mean
 * "stamp nothing", not "stamp an opaque square onto the proof".
 */
export const MASCOT_STAMP = BLOB_WAVE_STICKER;
