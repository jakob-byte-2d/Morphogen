import { CELL_TYPES, type World } from "./world";

/**
 * 32-bit FNV-1a hash of the full simulation state, bit for bit.
 * Two worlds with the same hash are (practically certainly) identical.
 * Used to check that every device computes exactly the same match.
 */
export function hashWorld(w: World): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;

  const mixByte = (b: number): void => {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  };
  const mixNumber = (n: number): void => {
    buf.setFloat64(0, n);
    for (let i = 0; i < 8; i++) mixByte(buf.getUint8(i));
  };

  mixNumber(w.tick);
  mixNumber(w.nextId);
  mixNumber(w.foodAccumulator);
  for (const s of w.rng.getState()) mixNumber(s);

  mixNumber(w.cells.length);
  for (const c of w.cells) {
    mixNumber(c.id);
    mixNumber(c.species);
    mixNumber(c.mode);
    mixNumber(CELL_TYPES.indexOf(c.type));
    mixNumber(c.x);
    mixNumber(c.y);
    mixNumber(c.vx);
    mixNumber(c.vy);
    mixNumber(c.mass);
    mixNumber(c.angle);
    mixNumber(c.age);
  }

  mixNumber(w.bonds.length);
  for (const b of w.bonds) {
    mixNumber(b.a);
    mixNumber(b.b);
  }

  mixNumber(w.food.length);
  for (const f of w.food) {
    mixNumber(f.x);
    mixNumber(f.y);
    mixNumber(f.vx);
    mixNumber(f.vy);
  }

  return (h >>> 0).toString(16).padStart(8, "0");
}
