import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVIRONMENT,
  NO_SINKING,
  countOrganisms,
  createWorld,
  makeBond,
  stepWorld,
  type Cell,
  type Environment,
  type World,
} from "../src/engine";
import { indexCells, shareNutrients } from "../src/engine/bonds";

/** Centre of the glass: tests place cells relative to it, away from the walls. */
const CX = DEFAULT_ENVIRONMENT.tankWidth / 2;
const CY = DEFAULT_ENVIRONMENT.tankHeight / 2;

/** An empty glass without food or sinking, so only the cells we place matter. */
function emptyWorld(overrides: Partial<Environment> = {}): World {
  const w = createWorld(1, {
    env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0, sink: NO_SINKING, ...overrides },
  });
  w.cells = [];
  w.bonds = [];
  return w;
}

/** A cell of the default genome (eaters), at (x, y) from the centre. Mode 0 divides into a bonded pair. */
function cell(id: number, x: number, y: number, mass: number, mode = 0): Cell {
  return { id, species: 0, mode, type: "eater", x: CX + x, y: CY + y, vx: 0, vy: 0, mass, angle: 0, age: 0, organism: id, anchored: false };
}

function place(w: World, cells: Cell[], bonds: [number, number][] = []): void {
  w.cells = cells;
  const byId = new Map(cells.map((c) => [c.id, c]));
  w.bonds = bonds.map(([a, b]) => makeBond(byId.get(a)!, byId.get(b)!));
  w.nextId = Math.max(...cells.map((c) => c.id)) + 1;
  indexCells(w);
}

function bonded(w: World, a: number, b: number): boolean {
  return w.bonds.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

describe("bonds", () => {
  it("the two daughters of a division stay bonded", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 250)]);
    stepWorld(w);
    expect(w.cells.map((c) => c.id)).toEqual([2, 3]);
    expect(bonded(w, 2, 3)).toBe(true);
    expect(countOrganisms(w)).toBe(1);
  });

  it("a budding division releases the second daughter as a new organism", () => {
    const w = emptyWorld();
    // Mode 3 of the default genome: one daughter stays (mode 3), one buds (mode 0).
    place(w, [cell(1, 0, 0, 250, 3)]);
    stepWorld(w);
    const [first, second] = w.cells;
    expect(first.mode).toBe(3);
    expect(second.mode).toBe(0);
    expect(w.bonds).toEqual([]);
    expect(countOrganisms(w)).toBe(2);
  });

  it("a budding daughter drops the parent's bonds, the staying one keeps them", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 250, 3), cell(2, 0, 25, 100, 3)], [[1, 2]]);
    stepWorld(w);
    const [stays, buds] = w.cells.filter((c) => c.id !== 2).map((c) => c.id);
    expect(bonded(w, stays, 2)).toBe(true);
    expect(bonded(w, buds, 2)).toBe(false);
  });

  it("a bond to a neighbour goes to the daughter on the neighbour's side", () => {
    const w = emptyWorld();
    // Parent divides along the x axis (angle 0); neighbour lies straight ahead.
    place(w, [cell(1, 0, 0, 250), cell(2, 25, 0, 100)], [[1, 2]]);
    stepWorld(w);
    const [plusSide, minusSide] = w.cells.filter((c) => c.id !== 2).map((c) => c.id);
    expect(bonded(w, plusSide, 2)).toBe(true);
    expect(bonded(w, minusSide, 2)).toBe(false);
    expect(bonded(w, plusSide, minusSide)).toBe(true);
  });

  it("a neighbour beside the division plane stays bonded to both daughters", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 250), cell(2, 0, 25, 100)], [[1, 2]]);
    stepWorld(w);
    const daughters = w.cells.filter((c) => c.id !== 2).map((c) => c.id);
    expect(daughters.every((d) => bonded(w, d, 2))).toBe(true);
    expect(countOrganisms(w)).toBe(1);
  });

  it("an overstretched bond breaks", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 100), cell(2, 80, 0, 100)], [[1, 2]]);
    stepWorld(w);
    expect(w.bonds).toEqual([]);
    expect(countOrganisms(w)).toBe(2);
  });

  it("a stretched bond pulls the cells together", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 100), cell(2, 24, 0, 100)], [[1, 2]]);
    for (let i = 0; i < 60; i++) stepWorld(w);
    const [a, b] = w.cells;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(21);
    expect(w.bonds.length).toBe(1);
  });

  it("bonds to dead cells disappear", () => {
    const w = emptyWorld({ nutrientShare: 0 });
    place(w, [cell(1, 0, 0, 100), cell(2, 19, 0, 30)], [[1, 2]]);
    stepWorld(w);
    expect(w.cells.map((c) => c.id)).toEqual([1]);
    expect(w.bonds).toEqual([]);
  });

  it("sharing food evens out mass and conserves the total", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 180), cell(2, 19, 0, 60)], [[1, 2]]);
    shareNutrients(w, 0.5);
    const [a, b] = w.cells;
    expect(a.mass + b.mass).toBeCloseTo(240, 10);
    expect(a.mass - b.mass).toBeLessThan(120);
    expect(a.mass).toBeGreaterThan(b.mass);
  });

  it("sharing never overshoots, however large the time step", () => {
    const w = emptyWorld();
    place(w, [cell(1, 0, 0, 180), cell(2, 19, 0, 60)], [[1, 2]]);
    shareNutrients(w, 100);
    const [a, b] = w.cells;
    expect(a.mass).toBeCloseTo(120, 10);
    expect(b.mass).toBeCloseTo(120, 10);
  });

  it("never gives a cell more bonds than the limit", () => {
    const w = createWorld(5);
    for (let i = 0; i < 15000; i++) stepWorld(w);
    const degree = new Map<number, number>();
    for (const b of w.bonds) {
      degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
      degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
    }
    expect(Math.max(0, ...degree.values())).toBeLessThanOrEqual(w.env.maxBondsPerCell);
  });
});

describe("budding keeps the organism together", () => {
  it("when one daughter buds, its sister takes over all of the parent's bonds", () => {
    const w = emptyWorld();
    // Mode 3 of the default genome buds its second daughter (the - side).
    // The neighbour sits on that side, yet the bond must survive on the first daughter.
    place(w, [cell(1, 0, 0, 250, 3), cell(2, -25, 0, 100, 3)], [[1, 2]]);
    stepWorld(w);
    const [stays, buds] = w.cells.filter((c) => c.id !== 2).map((c) => c.id);
    expect(bonded(w, stays, 2)).toBe(true);
    expect(bonded(w, buds, 2)).toBe(false);
  });

  it("with plenty of food, a Spiserklump organism grows to about 8 cells and no further, budding instead", () => {
    const w = createWorld(1, {
      env: {
        ...DEFAULT_ENVIRONMENT,
        tankWidth: 220,
        tankHeight: 220,
        foodPerSecond: 90,
        maxFood: 600,
        metabolism: 0.5,
        maxCells: 120,
        sink: NO_SINKING,
      },
    });
    // Track the biggest organism over time: it should get close to 8 cells (a bond
    // can break in the crush of divisions) and never grow past 8.
    let peak = 0;
    for (let i = 1; i <= 1800; i++) {
      stepWorld(w);
      if (i % 30 !== 0) continue;
      const sizes = new Map<number, number>();
      const parent = new Map<number, number>();
      const find = (id: number): number => {
        while (parent.get(id) !== id) id = parent.get(id)!;
        return id;
      };
      for (const c of w.cells) parent.set(c.id, c.id);
      for (const b of w.bonds) parent.set(find(b.a), find(b.b));
      for (const c of w.cells) sizes.set(find(c.id), (sizes.get(find(c.id)) ?? 0) + 1);
      peak = Math.max(peak, ...sizes.values());
    }
    expect(peak).toBeGreaterThanOrEqual(6);
    expect(peak).toBeLessThanOrEqual(8);
  });
});
