import type { World } from "./world";

/** A fingerprint of the whole glass (FNV-1a), for tests: the same glass gives the same hash. */
export function hashWorld(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193);
  };
  mix(w.tick);
  mix(w.life);
  mix(w.nextId);
  mix(w.waterLine);
  for (const v of w.rng.getState()) mix(v);
  for (let i = 0; i < w.ground.length; i++) mix(w.ground[i]);
  for (let i = 0; i < w.litter.length; i++) mix(w.litter[i]);
  for (const d of w.drops) [d.x, d.y].forEach(mix);
  for (const s of w.seeds) [s.id, s.species, s.x, s.y, s.ready, s.age].forEach(mix);
  for (const p of w.plants) [p.id, p.species, p.x, p.y, p.root, p.age, p.size, p.grow, p.thirst, p.life].forEach(mix);
  for (const a of w.animals) [a.id, a.x, a.dir, a.age, a.life, a.energy, a.mother, a.young].forEach(mix);
  return (h >>> 0).toString(16).padStart(8, "0");
}
