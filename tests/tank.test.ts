import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT, createWorld, radiusOf, stepWorld, stepWorldN, type World } from "../src/engine";
import { indexCells } from "../src/engine/bonds";
import { PRESETS } from "../src/genome/presets";

const { tankWidth: W, tankHeight: H } = DEFAULT_ENVIRONMENT;

function averageDepth(w: World, type: string): number {
  const cells = w.cells.filter((c) => c.type === type);
  return cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
}

describe("the glass", () => {
  it("layers itself: algae near the top, eaters near the bottom (phase 4 goal)", () => {
    const algae = createWorld(3, { genomes: [PRESETS.alge] });
    stepWorldN(algae, 9000);
    expect(algae.cells.length).toBeGreaterThan(10);
    expect(averageDepth(algae, "photo")).toBeLessThan(H * 0.35);

    const eaters = createWorld(3, { genomes: [PRESETS.klump] });
    stepWorldN(eaters, 9000);
    expect(eaters.cells.length).toBeGreaterThan(3);
    expect(averageDepth(eaters, "eater")).toBeGreaterThan(H * 0.75);
  });

  it("keeps every cell inside the glass", () => {
    const w = createWorld(5, { genomes: [PRESETS.svommer] });
    for (let i = 0; i < 9000; i++) {
      stepWorld(w);
      if (i % 100 !== 0) continue;
      for (const c of w.cells) {
        const r = radiusOf(c.mass);
        expect(c.x).toBeGreaterThanOrEqual(r - 1e-9);
        expect(c.x).toBeLessThanOrEqual(W - r + 1e-9);
        expect(c.y).toBeGreaterThanOrEqual(r - 1e-9);
        expect(c.y).toBeLessThanOrEqual(H - r + 1e-9);
      }
    }
  });

  it("drops new food in at the water surface", () => {
    const w = createWorld(1);
    w.cells = [];
    w.food = [];
    indexCells(w);
    stepWorldN(w, 3);
    expect(w.food.length).toBeGreaterThan(0);
    for (const f of w.food) expect(f.y).toBeLessThan(10);
  });

  it("lets food sink and settle on the bottom as sludge", () => {
    const w = createWorld(1, {
      env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0, sludgeDissolve: 0, sludgeDrift: 0 },
    });
    w.cells = [];
    indexCells(w);
    w.food = [{ x: 100, y: 30, vx: 0, vy: 0 }];
    stepWorldN(w, 30 * 400);
    const f = w.food[0];
    expect(f.y).toBeGreaterThan(H - 2);
    const settledAt = { x: f.x, y: f.y };
    stepWorldN(w, 300);
    expect(w.food[0]).toMatchObject(settledAt);
  });

  it("lets sludge slowly dissolve", () => {
    const w = createWorld(1, { env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0, sludgeDissolve: 0.05 } });
    w.cells = [];
    indexCells(w);
    w.food = Array.from({ length: 200 }, (_, i) => ({ x: 10 + i, y: H - 1.5, vx: 0, vy: 0 }));
    stepWorldN(w, 30 * 30);
    expect(w.food.length).toBeLessThan(100);
    expect(w.food.length).toBeGreaterThan(20);
  });

  it("turns a dead cell into particles of dead matter", () => {
    const w = createWorld(1, { env: { ...DEFAULT_ENVIRONMENT, foodPerSecond: 0, maxFood: 0 } });
    const [cell] = w.cells;
    cell.mass = DEFAULT_ENVIRONMENT.minMass - 0.5; // Starving: dies this tick.
    stepWorld(w);
    expect(w.cells.length).toBe(0);
    expect(w.food.length).toBe(Math.floor((DEFAULT_ENVIRONMENT.minMass - 0.5) / DEFAULT_ENVIRONMENT.foodMass));
    for (const f of w.food) {
      expect(Math.abs(f.x - cell.x)).toBeLessThan(10);
      expect(Math.abs(f.y - cell.y)).toBeLessThan(10);
    }
  });
});
