/**
 * Cell types. Saved glasses store these numbers, so only ever add new types
 * at the end, never in the middle.
 */
export const EMPTY = 0;
export const STONE = 1;
export const SAND = 2;
export const SOIL = 3;
export const WATER = 4;

/** Room for future types; tables below are this long. */
export const MAX_TYPES = 32;

/** Types that fall and pile up like sand. */
export const POWDER = new Uint8Array(MAX_TYPES);
/** Types that hold moisture. */
export const POROUS = new Uint8Array(MAX_TYPES);
/** Moisture a porous type holds against gravity; more seeps down. */
export const FIELD_CAPACITY = new Uint8Array(MAX_TYPES);
/** How much of the light reaching a cell it stops, out of 256. */
export const ABSORB = new Uint16Array(MAX_TYPES);

POWDER[SAND] = 1;
POWDER[SOIL] = 1;
POROUS[SAND] = 1;
POROUS[SOIL] = 1;
FIELD_CAPACITY[SAND] = 50;
FIELD_CAPACITY[SOIL] = 140;
ABSORB[STONE] = 256;
ABSORB[SAND] = 256;
ABSORB[SOIL] = 256;
ABSORB[WATER] = 14;
