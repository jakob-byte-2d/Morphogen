import type { Creature } from "./creatures";
import { SIZE } from "./dims";
import type { Plant, Tip } from "./plants";
import { cleanCreatureGenes, cleanPlantGenes, creatureGenesOf, MAX_ORG_ID, plantGenesOf } from "./genes";
import { normalizeCreatureSpecies, normalizePlantSpecies } from "./species";
import { CHUNKS_X, CHUNKS_Y, emptyWorld, SIM_VERSION, type World } from "./world";

/** Oldest engine version whose saved glasses can still be loaded. */
const SAVES_FROM = 7;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

function fromBase64(s: string, length: number): Uint8Array | null {
  if (typeof s !== "string") return null;
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 3 < s.length + 0 && o < length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (s[i + k] === "=" ? 0 : B64.indexOf(s[i + k])));
    if (v.some((x) => x < 0)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out[o++] = (n >> 16) & 255;
    if (o < length) out[o++] = (n >> 8) & 255;
    if (o < length) out[o++] = n & 255;
  }
  return o === length ? out : null;
}

/** A glass as plain data, ready for JSON. */
export interface SavedGlass {
  v: number;
  seed: number;
  tick: number;
  rng: number[];
  humidity: number;
  lostWater: number;
  nextOrgId: number;
  cells: Record<"type" | "shade" | "wet" | "food" | "kind" | "org" | "light", string>;
  /** Which parts of the glass are at rest; needed to carry on exactly. */
  chunks: string;
  plantSpecies: unknown[];
  creatureSpecies: unknown[];
  plants: unknown[];
  creatures: unknown[];
}

export function saveWorld(w: World): SavedGlass {
  return {
    v: SIM_VERSION,
    seed: w.seed,
    tick: w.tick,
    rng: [...w.rng.getState()],
    humidity: w.humidity,
    lostWater: w.lostWater,
    nextOrgId: w.nextOrgId,
    cells: {
      type: toBase64(w.type),
      shade: toBase64(w.shade),
      wet: toBase64(w.wet),
      food: toBase64(w.food),
      kind: toBase64(w.kind),
      org: toBase64(new Uint8Array(w.org.buffer, w.org.byteOffset, w.org.byteLength)),
      // Light is worked out only every few steps, so it is part of the state.
      light: toBase64(w.light),
    },
    chunks: toBase64(w.wakeNext),
    plantSpecies: w.plantSpecies,
    creatureSpecies: w.creatureSpecies,
    plants: w.plants,
    creatures: w.creatures,
  };
}

function int(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.min(max, Math.max(min, n));
}

function cellList(v: unknown): number[] {
  return Array.isArray(v) ? v.map((i) => int(i, 0, SIZE - 1)) : [];
}

/**
 * Restores a saved glass. Saved data may be old, damaged or from someone
 * else, so every value is checked; returns null if it cannot be used.
 */
export function loadWorld(data: unknown): World | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<SavedGlass>;
  // Glasses saved from version 7 on have the same layout and carry on under the newer rules.
  if (typeof d.v !== "number" || d.v < SAVES_FROM || d.v > SIM_VERSION || !d.cells || !Array.isArray(d.rng) || d.rng.length !== 4) return null;
  const plantSpecies = (Array.isArray(d.plantSpecies) ? d.plantSpecies : []).slice(0, 64).map(normalizePlantSpecies);
  const creatureSpecies = (Array.isArray(d.creatureSpecies) ? d.creatureSpecies : []).slice(0, 64).map(normalizeCreatureSpecies);
  if (plantSpecies.length === 0 || creatureSpecies.length === 0) return null;
  const w = emptyWorld(int(d.seed, 0, 0xffffffff), plantSpecies, creatureSpecies);
  const c = d.cells;
  const arrays = {
    type: fromBase64(c.type, SIZE),
    shade: fromBase64(c.shade, SIZE),
    wet: fromBase64(c.wet, SIZE),
    food: fromBase64(c.food, SIZE),
    kind: fromBase64(c.kind, SIZE),
    org: fromBase64(c.org, SIZE * 2),
    light: fromBase64(c.light, SIZE),
  };
  if (Object.values(arrays).some((a) => a === null)) return null;
  w.type.set(arrays.type!);
  w.shade.set(arrays.shade!);
  w.wet.set(arrays.wet!);
  w.food.set(arrays.food!);
  w.kind.set(arrays.kind!);
  new Uint8Array(w.org.buffer).set(arrays.org!);
  w.light.set(arrays.light!);
  w.tick = int(d.tick, 0, 2 ** 31);
  w.rng.setState(d.rng.map((v) => int(v, -(2 ** 31), 2 ** 32) | 0) as [number, number, number, number]);
  w.humidity = int(d.humidity, 0, 2 ** 31);
  w.lostWater = int(d.lostWater, 0, 2 ** 31);
  w.nextOrgId = int(d.nextOrgId, 1, MAX_ORG_ID);

  for (const raw of Array.isArray(d.plants) ? d.plants : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const p: Plant = {
      kind: "plant",
      id: int(r.id, 1, MAX_ORG_ID),
      species: int(r.species, 0, plantSpecies.length - 1),
      energy: int(r.energy, -100000, 100000),
      water: int(r.water, 0, 100000),
      store: int(r.store, 0, 100000),
      thirst: int(r.thirst, 0, 1000),
      age: int(r.age, 0, 2 ** 31),
      base: int(r.base, 0, SIZE - 1),
      cells: cellList(r.cells),
      tips: (Array.isArray(r.tips) ? r.tips : []).map((t: Record<string, unknown>): Tip => ({
        i: int(t?.i, 0, SIZE - 1),
        dx: int(t?.dx, -1, 1),
        len: int(t?.len, 0, 1000),
        max: int(t?.max, 0, 1000),
        main: t?.main === true,
        done: t?.done === true,
      })),
      maxLeaves: int(r.maxLeaves, 0, SIZE),
      maxFlowers: int(r.maxFlowers, 0, SIZE),
      genes: plantGenesOf(plantSpecies[0]),
      dead: false,
    };
    p.genes = cleanPlantGenes(r.genes, plantGenesOf(plantSpecies[p.species]));
    if (w.orgs.has(p.id)) continue;
    w.plants.push(p);
    w.orgs.set(p.id, p);
  }
  for (const raw of Array.isArray(d.creatures) ? d.creatures : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const c: Creature = {
      kind: "creature",
      id: int(r.id, 1, MAX_ORG_ID),
      species: int(r.species, 0, creatureSpecies.length - 1),
      energy: int(r.energy, -100000, 100000),
      store: int(r.store, 0, 100000),
      age: int(r.age, 0, 2 ** 31),
      cells: cellList(r.cells),
      dir: int(r.dir, -1, 1) || 1,
      genes: creatureGenesOf(creatureSpecies[0]),
      dead: false,
    };
    c.genes = cleanCreatureGenes(r.genes, creatureGenesOf(creatureSpecies[c.species]));
    if (w.orgs.has(c.id)) continue;
    w.creatures.push(c);
    w.orgs.set(c.id, c);
  }
  const chunks = fromBase64(d.chunks as string, CHUNKS_X * CHUNKS_Y);
  if (chunks) w.wakeNext.set(chunks);
  else w.wakeNext.fill(1);
  return w;
}
