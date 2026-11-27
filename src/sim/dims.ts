/** The glass: W × H cells, seen from the side. Measures in the rules are in units of SCALE cells. */
export const W = 144;
export const H = 256;
export const SCALE = 2;
export const SIZE = W * H;

/** Fast steps per second: for what falls (soil, water drops, seeds). */
export const TICKS_PER_SECOND = 10;
/** One life step every five minutes: for everything that lives, grows, ages and rots. */
export const LIFE_EVERY = 5 * 60 * TICKS_PER_SECOND;
export const LIFE_PER_DAY = (24 * 60) / 5;

/** Bump when the rules change on purpose (and update the golden hash in the tests). */
export const SIM_VERSION = 2;
