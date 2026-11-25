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

// Plants and what is left of them.
export const SEED = 5;
export const ROOT = 6;
export const STEM = 7;
export const LEAF = 8;
export const FLOWER = 9;
export const WASTE = 10;

POWDER[SEED] = 1;
POWDER[WASTE] = 1;
POROUS[ROOT] = 1;
FIELD_CAPACITY[ROOT] = 140;
POROUS[WASTE] = 1;
FIELD_CAPACITY[WASTE] = 100;
ABSORB[SEED] = 60;
ABSORB[ROOT] = 256;
ABSORB[STEM] = 70;
ABSORB[LEAF] = 105;
ABSORB[FLOWER] = 80;
ABSORB[WASTE] = 220;

/** Living plant cells. */
export const PLANT_PART = new Uint8Array(MAX_TYPES);
PLANT_PART[ROOT] = 1;
PLANT_PART[STEM] = 1;
PLANT_PART[LEAF] = 1;
PLANT_PART[FLOWER] = 1;

// Feed and creatures.
export const FEED = 11;
export const APHID = 12;
export const SLIME = 13;

POWDER[FEED] = 1;
ABSORB[FEED] = 160;
ABSORB[APHID] = 60;
ABSORB[SLIME] = 120;

/** Cells that belong to a creature. */
export const CREATURE_PART = new Uint8Array(MAX_TYPES);
CREATURE_PART[APHID] = 1;
CREATURE_PART[SLIME] = 1;
