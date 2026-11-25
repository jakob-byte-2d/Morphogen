/**
 * Sizes and timing, in a module of their own so every part of the engine can
 * use them at load time without import cycles.
 */

/**
 * Cells per unit of length. Species sizes and many rules are given in units,
 * so organisms keep their size in the glass while the cells get finer. The
 * glass was 72 × 128 cells at scale 1.
 */
export const SCALE = 2;
/** Cells per unit of area. */
export const AREA = SCALE * SCALE;

/** The glass is W cells wide and H cells tall. y = 0 is the top. */
export const W = 72 * SCALE;
export const H = 128 * SCALE;
export const SIZE = W * H;

/** Simulation steps per second at normal speed. */
export const TICKS_PER_SECOND = 10;
