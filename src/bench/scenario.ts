import {
  DEFAULT_ENVIRONMENT,
  Rng,
  createWorld,
  mode,
  type Bond,
  type Cell,
  type World,
} from "../engine";
import { indexCells } from "../engine/bonds";
import { TWO_PI, cos, sin, sqrt } from "../engine/fmath";

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
    dishRadius: 300 * scale,
    maxFood: Math.round(5 * count),
    foodPerSecond: (25 * count) / 200,
    metabolism: 0,
    maxCells: count,
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
    const r = (env.dishRadius - 20) * sqrt(rng.next());
    const a = rng.range(0, TWO_PI);
    const id = i + 1;
    cells.push({
      id,
      species: 0,
      mode: 0,
      type: "eater",
      x: r * cos(a),
      y: r * sin(a),
      vx: 0,
      vy: 0,
      mass: 150,
      angle: a,
      age: 0,
    });
    if (i % 4 !== 0) bonds.push({ a: id - 1, b: id });
  }
  w.cells = cells;
  w.bonds = bonds;
  w.nextId = count + 1;
  indexCells(w);
  return w;
}
