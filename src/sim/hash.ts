import type { World } from "./world";

/** FNV-1a fingerprint of the whole state. Equal hashes mean equal glasses. */
export function hashWorld(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  mix(w.tick);
  mix(w.life);
  for (const v of w.rng.getState()) mix(v);
  for (const arr of [w.type, w.shade, w.wet, w.food, w.org, w.kind, w.light]) for (let i = 0; i < arr.length; i++) mix(arr[i]);
  mix(w.nextOrgId);
  mix(w.fixed);
  mix(w.burned);
  mix(w.arrivals.length);
  for (const a of w.arrivals) for (const v of [a.life, a.species, a.x]) mix(v);
  mix(w.plantSpecies.length);
  for (const sp of w.plantSpecies) for (const v of [sp.traits.growth, sp.traits.seed, sp.traits.mutation]) mix(v);
  mix(w.creatureSpecies.length);
  for (const sp of w.creatureSpecies) for (const v of [sp.traits.size, sp.traits.speed, sp.traits.growth, sp.traits.mutation]) mix(v);
  mix(w.humidity);
  mix(w.groundwater);
  mix(w.lostWater);
  for (const p of w.plants) {
    for (const v of [p.id, p.species, p.energy, p.water, p.store, p.thirst, p.age, p.base, p.maxLeaves, p.maxFlowers, p.cells.length]) mix(v);
    for (const v of [p.genes.growth, p.genes.seed, p.genes.mutation, p.genes.tint + 16]) mix(v);
    for (const i of p.cells) mix(i);
    for (const t of p.tips) for (const v of [t.i, t.dx + 2, t.len, t.max, t.main ? 1 : 0, t.done ? 1 : 0]) mix(v);
  }
  for (const c of w.creatures) {
    for (const v of [c.id, c.species, c.energy, c.store, c.age, c.mother, c.young, c.cells.length]) mix(v);
    for (const v of [c.genes.size, c.genes.speed, c.genes.growth, c.genes.mutation, c.genes.tint + 16]) mix(v);
    for (const i of c.cells) mix(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
