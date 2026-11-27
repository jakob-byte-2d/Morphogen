import { H, W } from "./dims";
import { EMPTY, type World } from "./world";

/**
 * Water is one number: the water line. Below it, air is pond and soil is
 * wet; roots that reach it drink. The watering can raises it, and it sinks
 * slowly as the water evaporates: about a row a day.
 */
export function waterLine(w: World): number {
  return w.waterLine >> 8;
}

/** How much one drop raises the water line (in 1/256 rows). */
const DROP = 6;
/** The water line never rises above this row. */
const HIGHEST = 40;

export function evaporate(w: World): void {
  if (w.waterLine < H * 256) w.waterLine++;
}

/** Drops from the watering can fall two cells a step and soak in where they land. */
export function fallDrops(w: World): void {
  if (w.drops.length === 0) return;
  const line = waterLine(w);
  let n = 0;
  for (const d of w.drops) {
    let landed = false;
    for (let k = 0; k < 2 && !landed; k++) {
      if (d.y + 1 >= H || d.y + 1 >= line || w.ground[(d.y + 1) * W + d.x] !== EMPTY) landed = true;
      else d.y++;
    }
    if (landed) w.waterLine = Math.max(HIGHEST * 256, w.waterLine - DROP);
    else w.drops[n++] = d;
  }
  w.drops.length = n;
}
