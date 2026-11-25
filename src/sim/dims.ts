/**
 * Sizes and timing, in a module of their own so every part of the engine can
 * use them at load time without import cycles.
 */

/** The glass is W cells wide and H cells tall. y = 0 is the top. */
export const W = 72;
export const H = 128;
export const SIZE = W * H;

/** Simulation steps per second at normal speed. */
export const TICKS_PER_SECOND = 10;
