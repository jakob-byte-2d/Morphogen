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
  for (const v of w.rng.getState()) mix(v);
  for (const arr of [w.type, w.shade, w.wet, w.food, w.org]) for (let i = 0; i < arr.length; i++) mix(arr[i]);
  return (h >>> 0).toString(16).padStart(8, "0");
}
