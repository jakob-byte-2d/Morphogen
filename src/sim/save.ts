import { H, SIM_VERSION, SIZE, W } from "./dims";
import { refreshTop } from "./ground";
import { PLANTS } from "./species";
import type { RngState } from "./rng";
import { emptyWorld, type Animal, type Plant, type Seed, type World } from "./world";

function toBase64(a: Uint8Array): string {
  let s = "";
  for (let k = 0; k < a.length; k += 4096) s += String.fromCharCode(...a.subarray(k, k + 4096));
  return btoa(s);
}

function fromBase64(s: unknown, n: number): Uint8Array | null {
  if (typeof s !== "string") return null;
  try {
    const bin = atob(s);
    if (bin.length !== n) return null;
    const a = new Uint8Array(n);
    for (let k = 0; k < n; k++) a[k] = bin.charCodeAt(k);
    return a;
  } catch {
    return null;
  }
}

/** A whole number in [lo, hi], or the fallback. */
function int(v: unknown, lo: number, hi: number, fallback = lo): number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
}

/** The glass as plain data (JSON), to keep and to load again. */
export function saveWorld(w: World) {
  return {
    v: SIM_VERSION,
    seed: w.seed,
    rng: w.rng.getState(),
    tick: w.tick,
    life: w.life,
    nextId: w.nextId,
    waterLine: w.waterLine,
    ground: toBase64(w.ground),
    litter: toBase64(w.litter),
    drops: w.drops.map((d) => [d.x, d.y]),
    seeds: w.seeds.map((s) => [s.id, s.species, s.x, s.y, s.ready, s.age]),
    plants: w.plants.map((p) => [p.id, p.species, p.x, p.y, p.age, p.size, p.grow, p.thirst, p.life]),
    animals: w.animals.map((a) => [a.id, a.x, a.dir, a.age, a.life, a.energy, a.mother, a.young]),
  };
}

export type SavedWorld = ReturnType<typeof saveWorld>;

/** Loads a saved glass, or null if the data is damaged or from another version. */
export function loadWorld(data: unknown): World | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== SIM_VERSION || !Array.isArray(d.rng) || d.rng.length !== 4) return null;
  const ground = fromBase64(d.ground, SIZE);
  const litter = fromBase64(d.litter, W);
  if (!ground || !litter) return null;
  const big = 2 ** 31 - 1;
  const w = emptyWorld(int(d.seed, 0, 2 ** 32));
  w.rng.setState((d.rng as number[]).map((v) => v | 0) as RngState);
  w.tick = int(d.tick, 0, Number.MAX_SAFE_INTEGER);
  w.life = int(d.life, 0, big);
  w.nextId = int(d.nextId, 1, big, 1);
  w.waterLine = int(d.waterLine, 0, H * 256, H * 256);
  w.ground.set(ground);
  w.litter.set(litter);
  w.settled = false;
  refreshTop(w);
  const rows = (v: unknown, n: number): number[][] =>
    Array.isArray(v) ? v.filter((r): r is number[] => Array.isArray(r) && r.length === n && r.every((x) => Number.isInteger(x))) : [];
  const x = (v: number) => Math.max(0, Math.min(W - 1, v));
  const y = (v: number) => Math.max(0, Math.min(H - 1, v));
  w.drops = rows(d.drops, 2).map(([a, b]) => ({ x: x(a), y: y(b) }));
  w.seeds = rows(d.seeds, 6).map(([id, sp, a, b, ready, age]): Seed => ({ id, species: Math.max(0, Math.min(PLANTS.length - 1, sp)), x: x(a), y: y(b), ready, age }));
  w.plants = rows(d.plants, 9).map(
    ([id, sp, a, b, age, size, grow, thirst, life]): Plant => ({
      id,
      species: Math.max(0, Math.min(PLANTS.length - 1, sp)),
      x: x(a),
      y: y(b),
      age,
      size: Math.max(0, Math.min(PLANTS[Math.max(0, Math.min(PLANTS.length - 1, sp))].full, size)),
      grow,
      thirst,
      life,
    }),
  );
  w.animals = rows(d.animals, 8).map(
    ([id, a, dir, age, life, energy, mother, young]): Animal => ({ id, x: x(a), dir: dir < 0 ? -1 : 1, age, life, energy, mother, young, dead: false, starved: false }),
  );
  return w;
}
