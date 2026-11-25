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
/**
 * How much of the light reaching a cell it stops, out of 256. Above ground
 * only leaves (and a little, flowers) cast shade, so the shade under a
 * plant goes with how dense its leaves are; stems, seeds, dead leaves and
 * animals let the light through. Set for SCALE 2.
 */
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
ABSORB[WATER] = 7;

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
// Dead leaves (WASTE) hold no water: rain and dew run off them into the ground.
ABSORB[ROOT] = 256;
ABSORB[STEM] = 6;
ABSORB[LEAF] = 59;
ABSORB[FLOWER] = 24;

/** Living plant cells. */
export const PLANT_PART = new Uint8Array(MAX_TYPES);
PLANT_PART[ROOT] = 1;
PLANT_PART[STEM] = 1;
PLANT_PART[LEAF] = 1;
PLANT_PART[FLOWER] = 1;

// Feed and creatures.
export const FEED = 11;
/** A skrukketroll (woodlouse). Was an aphid once; same number. */
export const ISOPOD = 12;
/** No longer used (there is no slime: only plant eaters), but keeps its number. */
export const SLIME = 13;

POWDER[FEED] = 1;

/** Cells that belong to a creature. */
export const CREATURE_PART = new Uint8Array(MAX_TYPES);
CREATURE_PART[ISOPOD] = 1;
CREATURE_PART[SLIME] = 1;

// No longer used (there are no worms, and no fungus: skrukketroll and slime
// turn dead leaves into soil), but they keep their numbers so the ones after
// them keep theirs.
export const WORM = 14;
export const FUNGUS = 15;

POROUS[FUNGUS] = 1;
FIELD_CAPACITY[FUNGUS] = 100;
CREATURE_PART[WORM] = 1;
