import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVIRONMENT,
  createWorld,
  mode,
  stepWorld,
  stepWorldN,
  type Cell,
  type Environment,
  type World,
} from "../src/engine";
import { indexCells } from "../src/engine/bonds";
import { PRESETS } from "../src/genome/presets";

/** A genome whose single mode never divides, of the given type. */
const loner = (cellType: "eater" | "photo") => ({
  version: 1,
  name: cellType,
  startMode: 0,
  modes: [mode({ cellType, canSplit: false })],
});

function world(env: Partial<Environment>, cellType: "eater" | "photo"): World {
  return createWorld(1, {
    env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0, ...env },
    genomes: [loner(cellType)],
  });
}

function cellAt(w: World, id: number, x: number, y: number, mass: number): Cell {
  const type = w.genomes[0].modes[0].cellType;
  return { id, species: 0, mode: 0, type, x, y, vx: 0, vy: 0, mass, angle: 0, age: 0 };
}

describe("light", () => {
  it("a light collector grows in light without food", () => {
    const w = world({}, "photo");
    const start = w.cells[0].mass;
    stepWorldN(w, 300);
    expect(w.cells[0].mass).toBeGreaterThan(start);
  });

  it("a light collector starves in the dark", () => {
    const w = world({ light: 0 }, "photo");
    stepWorldN(w, 30 * 120);
    expect(w.cells.length).toBe(0);
  });

  it("an eater gets nothing from light", () => {
    const w = world({}, "eater");
    const start = w.cells[0].mass;
    stepWorldN(w, 300);
    expect(w.cells[0].mass).toBeLessThan(start);
  });

  it("a light collector does not eat food", () => {
    const w = createWorld(1, {
      env: { ...DEFAULT_ENVIRONMENT, light: 0, foodPerSecond: 0 },
      genomes: [loner("photo")],
    });
    const food = w.food.length;
    stepWorldN(w, 300);
    expect(w.food.length).toBe(food);
  });

  it("light fades with depth", () => {
    const w = world({ sink: { eater: 0, photo: 0, swim: 0 } }, "photo");
    w.cells = [cellAt(w, 1, 50, 40, 100), cellAt(w, 2, 250, 400, 100)];
    w.nextId = 3;
    indexCells(w);
    stepWorld(w);
    const [shallow, deep] = w.cells;
    expect(shallow.mass).toBeGreaterThan(deep.mass);
  });

  it("a cell shades the cells below it in the same column", () => {
    const w = world({ sink: { eater: 0, photo: 0, swim: 0 } }, "photo");
    // Cells 1 and 2 share a column, 2 lies under 1. Cell 3 is alone at the same depth as 2.
    w.cells = [cellAt(w, 1, 110, 60, 100), cellAt(w, 2, 110, 120, 100), cellAt(w, 3, 210, 120, 100)];
    w.nextId = 4;
    indexCells(w);
    stepWorld(w);
    const shaded = w.cells.find((c) => c.id === 2)!;
    const alone = w.cells.find((c) => c.id === 3)!;
    expect(alone.mass).toBeGreaterThan(shaded.mass);
  });

  it("no cell grows past the mass limit", () => {
    const w = world({}, "photo");
    stepWorldN(w, 30 * 300);
    expect(w.cells[0].mass).toBeLessThanOrEqual(w.env.maxCellMass);
  });
});

describe("population limit", () => {
  it("cells stop dividing at maxCells", () => {
    const w = createWorld(2, {
      env: { ...DEFAULT_ENVIRONMENT, maxCells: 40 },
      genomes: [PRESETS.alge],
    });
    for (let i = 0; i < 20000; i++) {
      stepWorld(w);
      expect(w.cells.length).toBeLessThanOrEqual(40);
    }
    expect(w.cells.length).toBeGreaterThan(30);
  });
});
