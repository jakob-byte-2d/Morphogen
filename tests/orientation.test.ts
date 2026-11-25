import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVIRONMENT,
  createWorld,
  makeBond,
  mode,
  stepWorldN,
  type Cell,
  type World,
} from "../src/engine";
import { indexCells } from "../src/engine/bonds";
import { atan, atan2, wrapAngle } from "../src/engine/fmath";

describe("deterministic atan/atan2", () => {
  it("match Math.atan and Math.atan2 closely", () => {
    for (let i = -5000; i <= 5000; i++) {
      const x = i / 50;
      expect(Math.abs(atan(x) - Math.atan(x))).toBeLessThan(1e-12);
    }
    for (let i = 0; i < 3600; i++) {
      const a = -Math.PI + (i * Math.PI) / 1800;
      const y = 5 * Math.sin(a);
      const x = 5 * Math.cos(a);
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-12);
    }
    expect(atan2(0, 0)).toBe(0);
  });
});

/** A dish without food or light, with non-dividing cells of the given types. */
function dish(): World {
  return createWorld(1, {
    env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0, light: 0, metabolism: 0, swimCost: 0 },
    genomes: [
      {
        version: 1,
        name: "test",
        startMode: 0,
        modes: [mode({ canSplit: false }), mode({ cellType: "swim", canSplit: false })],
      },
    ],
  });
}

function cell(id: number, x: number, y: number, angle: number, swim = false): Cell {
  return {
    id,
    species: 0,
    mode: swim ? 1 : 0,
    type: swim ? "swim" : "eater",
    x,
    y,
    vx: 0,
    vy: 0,
    mass: 100,
    angle,
    age: 0,
  };
}

describe("orientation", () => {
  it("cells turn along when their organism is rotated", () => {
    const w = dish();
    const a = cell(1, 0, 0, 0.3);
    const b = cell(2, 18, 0, -0.5);
    w.cells = [a, b];
    w.bonds = [makeBond(a, b)];
    w.nextId = 3;
    indexCells(w);

    // Rotate the pair a quarter turn around a's centre.
    b.x = 0;
    b.y = 18;
    stepWorldN(w, 60);
    expect(wrapAngle(w.cells[0].angle - (0.3 + Math.PI / 2))).toBeCloseTo(0, 2);
    expect(wrapAngle(w.cells[1].angle - (-0.5 + Math.PI / 2))).toBeCloseTo(0, 2);
  });

  it("a swimmer behind an eater pushes the organism forward", () => {
    const w = dish();
    const eater = cell(1, 0, 0, 0);
    const swimmer = cell(2, -18, 0, 0, true);
    w.cells = [eater, swimmer];
    w.bonds = [makeBond(eater, swimmer)];
    w.nextId = 3;
    indexCells(w);

    stepWorldN(w, 90);
    const [e, s] = w.cells;
    expect(e.x).toBeGreaterThan(20);
    expect(s.x).toBeLessThan(e.x);
    expect(Math.abs(e.y)).toBeLessThan(5);
    expect(w.bonds.length).toBe(1);
  });

  it("a lone swimmer bounces off the wall instead of getting stuck", () => {
    const w = dish();
    w.cells = [cell(1, 250, 0, 0, true)];
    w.bonds = [];
    w.nextId = 2;
    indexCells(w);
    stepWorldN(w, 120);
    const s = w.cells[0];
    expect(Math.cos(s.angle)).toBeLessThan(0); // Now heading back into the dish.
    expect(s.x).toBeLessThan(260);
  });
});
