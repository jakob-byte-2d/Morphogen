import { describe, expect, it } from "vitest";
import {
  applyTool,
  createWorld,
  EMPTY,
  FLOWER,
  H,
  LEAF,
  ROOT,
  SEED,
  setCell,
  SOIL,
  STEM,
  stepWorldN,
  totalUnits,
  totalWater,
  W,
  WASTE,
  normalizePlantSpecies,
} from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: World, t: number) => w.type.filter((v) => v === t).length;

/** A flat bed of soil with the given moisture, and one seed on it. */
function bed(wet: number, species = 1): World {
  const w = emptyWorld(7);
  for (let y = H - 30; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = wet;
      w.food[at(x, y)] = 6;
    }
  setCell(w, at(36, H - 31), SEED);
  w.kind[at(36, H - 31)] = species;
  w.food[at(36, H - 31)] = 1;
  return w;
}

describe("seeds", () => {
  it("sprout on moist soil after a few seconds", () => {
    const w = bed(120);
    stepWorldN(w, 60);
    expect(w.plants.length).toBe(0);
    stepWorldN(w, 120);
    expect(w.plants.length).toBe(1);
    expect(w.type[at(36, H - 30)]).toBe(ROOT);
  });

  it("do not sprout on dry soil, and in the end rot", () => {
    const w = bed(10);
    stepWorldN(w, 600);
    expect(w.plants.length).toBe(0);
    stepWorldN(w, 600);
    expect(count(w, SEED)).toBe(0);
    expect(count(w, WASTE)).toBe(1);
  });
});

describe("growth", () => {
  it("grows a flower with roots, leaves and a flower head", () => {
    const w = bed(130);
    stepWorldN(w, 1800);
    expect(w.plants.length).toBeGreaterThanOrEqual(1);
    const p = w.plants[0];
    const types = p.cells.map((i) => w.type[i]);
    expect(types.filter((t) => t === ROOT).length).toBeGreaterThan(2);
    expect(types.filter((t) => t === LEAF).length).toBeGreaterThan(2);
    expect(types.filter((t) => t === FLOWER).length).toBeGreaterThan(0);
    // The top of the plant is well above the ground.
    const top = Math.min(...p.cells.filter((i) => w.type[i] === STEM).map((i) => (i / W) | 0));
    expect(H - 31 - top).toBeGreaterThan(10);
  });

  it("dries out and turns to waste without water", () => {
    const w = bed(130);
    stepWorldN(w, 600);
    expect(w.plants.length).toBe(1);
    const cells = w.plants[0].cells.length;
    for (let i = 0; i < w.wet.length; i++) w.wet[i] = 0;
    w.humidity = 0;
    stepWorldN(w, 600);
    expect(w.plants.length).toBe(0);
    expect(count(w, WASTE)).toBeGreaterThanOrEqual(cells);
  });
});

describe("the closed glass", () => {
  it("never creates or loses nutrients", () => {
    const w = createWorld(42);
    const units = totalUnits(w);
    for (let k = 0; k < 10; k++) {
      stepWorldN(w, 600);
      expect(totalUnits(w)).toBe(units);
    }
  });

  it("never creates or loses water", () => {
    const w = createWorld(43);
    const water = totalWater(w);
    stepWorldN(w, 3000);
    expect(totalWater(w)).toBe(water);
  });

  it("brings life to the start glass by itself", () => {
    const w = createWorld(44);
    stepWorldN(w, 1200);
    expect(w.plants.length).toBeGreaterThanOrEqual(3);
  });
});

describe("seed tool", () => {
  it("sows the chosen species into empty cells", () => {
    const w = emptyWorld(9);
    for (let k = 0; k < 40; k++) applyTool(w, "seed", 20, 20, 2);
    const seeds = [...w.type.keys()].filter((i) => w.type[i] === SEED);
    expect(seeds.length).toBeGreaterThan(5);
    expect(seeds.every((i) => w.kind[i] === 2)).toBe(true);
    expect(w.type[at(0, 0)]).toBe(EMPTY);
  });
});

describe("species from other players", () => {
  it("are cleaned up", () => {
    const sp = normalizePlantSpecies({ name: 42, form: "tree", height: 999, branches: -3, colors: { leaf: "red", stem: "#123ABC" } });
    expect(sp.form).toBe("flower");
    expect(sp.height).toBe(40);
    expect(sp.branches).toBe(0);
    expect(sp.colors.leaf).toMatch(/^#[0-9a-f]{6}$/);
    expect(sp.colors.stem).toBe("#123abc");
  });
});
