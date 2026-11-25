import {
  DEFAULT_ENVIRONMENT,
  NO_SINKING,
  Rng,
  createWorld,
  makeBond,
  mode,
  type Bond,
  type Cell,
  type World,
} from "../engine";
import { indexCells } from "../engine/bonds";
import { TWO_PI, sqrt } from "../engine/fmath";

/**
 * A crowded dish with exactly `count` cells, for measuring speed. The cells
 * never divide, so the count stays steady, and they come in bonded groups of
 * four with plenty of food around, so every part of the engine is exercised.
 * The layout is deterministic, so every device measures the same work.
 */
export function crowdedWorld(count: number): World {
  const scale = sqrt(count / 200);
  const env = {
    ...DEFAULT_ENVIRONMENT,
    tankWidth: 300 * scale,
    tankHeight: 450 * scale,
    maxFood: Math.round(5 * count),
    foodPerSecond: (25 * count) / 200,
    metabolism: 0,
    maxCells: count,
    // No sinking, so the cells stay spread out while we measure.
    sink: NO_SINKING,
  };
  const genome = {
    version: 1,
    name: "bench",
    startMode: 0,
    modes: [mode({ canSplit: false })],
  };
  const w = createWorld(1, { env, genomes: [genome] });

  const rng = new Rng(2);
  const cells: Cell[] = [];
  const bonds: Bond[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, TWO_PI);
    const id = i + 1;
    cells.push({
      id,
      species: 0,
      mode: 0,
      type: "eater",
      x: rng.range(20, env.tankWidth - 20),
      y: rng.range(20, env.tankHeight - 20),
      vx: 0,
      vy: 0,
      mass: 150,
      angle: a,
      age: 0,
      organism: Math.floor(i / 4) + 1,
      anchored: false,
    });
    if (i % 4 !== 0) bonds.push(makeBond(cells[i - 1], cells[i]));
  }
  w.cells = cells;
  w.bonds = bonds;
  w.nextId = count + 1;
  indexCells(w);
  return w;
}
