import { H, W } from "./dims";
import { formOf } from "./forms";
import { addLitter } from "./litter";
import { PLANTS } from "./species";
import { waterLine } from "./water";
import { EMPTY, newId, type Plant, type Seed, type World } from "./world";

/** How deep a plant's roots reach now: deeper as it grows. */
export function reachOf(p: Plant): number {
  const sp = PLANTS[p.species];
  return sp.reach[0] + (((sp.reach[1] - sp.reach[0]) * p.size) / sp.full | 0);
}

/** A plant that has had no water for this long wilts; this much longer, and it dies. */
export const WILTS = 48;
const DIES = 2 * 288;

/** Seeds wait this many life steps where they can sprout (an hour), and rot after two days elsewhere. */
const SPROUT = 12;
const SEED_ROTS = 2 * 288;
/** How near a seed the sides of its pit must be. */
const PIT = 3;

/** Does the seed lie still on the ground? */
function resting(w: World, s: Seed): boolean {
  return s.y + 1 >= H || w.ground[(s.y + 1) * W + s.x] !== EMPTY;
}

/** Ground (or the glass) beside the seed on side d, within a few cells: the side of a pit. */
function side(w: World, s: Seed, d: number): boolean {
  for (let k = 1; k <= PIT; k++) {
    const x = s.x + d * k;
    if (x < 0 || x >= W) return true;
    if (w.ground[s.y * W + x] !== EMPTY) return true;
  }
  return false;
}

/**
 * Can this seed sprout where it lies? On the ground, out of the water, with
 * the water line near enough below, and no plant right there. Bushes and
 * flowers need a little pit too (or dead leaves round them). The view asks
 * this as well, to make such a seed blink.
 */
export function canSprout(w: World, s: Seed): boolean {
  if (!resting(w, s) || s.y + 1 >= H) return false;
  const line = waterLine(w);
  const sp = PLANTS[s.species];
  if (s.y >= line || line - (s.y + 1) > sp.reach[0]) return false;
  for (const p of w.plants) if (Math.abs(p.x - s.x) <= 2 && Math.abs(p.y - s.y) <= 3) return false;
  if (!sp.pit) return true;
  return w.litter[s.x] >= 2 || (side(w, s, -1) && side(w, s, 1));
}

/** Seeds fall a cell a step until they lie on the ground. */
export function fallSeeds(w: World): void {
  for (const s of w.seeds) if (!resting(w, s)) s.y++;
}

export function dropSeed(w: World, species: number, x: number, y: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || w.ground[y * W + x] !== EMPTY) return;
  w.seeds.push({ id: newId(w), species, x, y, ready: 0, age: 0 });
}

function updateSeeds(w: World): void {
  let n = 0;
  for (const s of w.seeds) {
    if (!resting(w, s)) {
      w.seeds[n++] = s;
      continue;
    }
    s.age++;
    if (canSprout(w, s)) s.ready++;
    if (s.ready >= SPROUT && canSprout(w, s)) {
      const sp = PLANTS[s.species];
      const life = sp.life - (sp.life >> 3) + w.rng.below((sp.life >> 2) + 1);
      w.plants.push({ id: s.id, species: s.species, x: s.x, y: s.y, age: 0, size: 0, grow: 0, thirst: 0, life });
      continue;
    }
    if (s.age < SEED_ROTS) w.seeds[n++] = s;
  }
  w.seeds.length = n;
}

/** A dead plant becomes dead leaves on the ground round where it stood. */
function die(w: World, p: Plant): void {
  const f = formOf(PLANTS[p.species].form, p.id);
  const reach = Math.max(1, ((f.half * p.size) / PLANTS[p.species].full) | 0);
  const leaves = 1 + ((p.size * (p.species === 2 ? 3 : 1)) >> 1);
  for (let k = 0; k < leaves; k++) addLitter(w, p.x - reach + w.rng.below(2 * reach + 1), 1);
}

/**
 * Plants: each life step a plant with its roots in water grows a little,
 * until full grown; without water it wilts and in the end dies. Full grown,
 * it drops dead leaves now and then, and seeds. It dies of old age, or if
 * the ground under it is dug away or it is buried.
 */
export function updatePlants(w: World): void {
  updateSeeds(w);
  const line = waterLine(w);
  let n = 0;
  for (const p of w.plants) {
    const sp = PLANTS[p.species];
    p.age++;
    const below = (p.y + 1) * W + p.x;
    if (p.y + 1 >= H || w.ground[below] === EMPTY || w.ground[p.y * W + p.x] !== EMPTY || p.age >= p.life) {
      die(w, p);
      continue;
    }
    // Standing in the pond it drowns; with its roots in the wet ground it drinks.
    if (p.y >= line) p.thirst += 2;
    else if (line - (p.y + 1) <= reachOf(p)) p.thirst = Math.max(0, p.thirst - 4);
    else p.thirst++;
    if (p.thirst >= DIES) {
      die(w, p);
      continue;
    }
    w.plants[n++] = p;
    if (p.thirst > 0) continue;
    if (p.size < sp.full) {
      if (++p.grow >= sp.growEvery) {
        p.grow = 0;
        p.size++;
      }
      continue;
    }
    // Full grown: dead leaves and seeds.
    const f = formOf(sp.form, p.id);
    if (w.rng.below(sp.leafEvery) === 0) addLitter(w, p.x - f.half + w.rng.below(2 * f.half + 1), 1);
    if (w.rng.below(sp.seedEvery) === 0) {
      if (sp.form === "grass") {
        // Grass spreads: a seed lands a little way off.
        const d = 4 + w.rng.below(8);
        const x = p.x + (w.rng.below(2) === 0 ? -d : d);
        if (x >= 0 && x < W) dropSeed(w, p.species, x, Math.max(0, w.top[x] - 1));
      } else if (f.heads.length > 0) {
        const h = f.heads[w.rng.below(f.heads.length)];
        dropSeed(w, p.species, p.x + f.dx[h], p.y + f.dy[h]);
      }
    }
  }
  w.plants.length = n;
}
