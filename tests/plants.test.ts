import { describe, expect, it } from "vitest";
import {
  applyTool,
  computeLight,
  createWorld,
  EMPTY,
  FLOWER,
  H,
  ISOPOD,
  LEAF,
  ROOT,
  SEED,
  setCell,
  SOIL,
  STEM,
  stepWorldN,
  totalUnits,
  totalWater,
  unitLedger,
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

  it("lives on past its old lifespan, and sheds old leaves as litter", () => {
    const w = bed(130);
    const sp = w.plantSpecies[1];
    // Keep the soil moist, as dew and watering would.
    for (let k = 0; k < 13; k++) {
      stepWorldN(w, sp.lifespan);
      for (let i = 0; i < w.wet.length; i++) if (w.type[i] === SOIL) w.wet[i] = Math.max(w.wet[i], 120);
    }
    // The first plant is still there, and bigger than ever.
    expect(w.plants.some((p) => p.age * 4 > sp.lifespan * 10)).toBe(true);
    expect(count(w, WASTE)).toBeGreaterThan(5);
  });

  it("grows along the glass when it reaches the lid", () => {
    // Soil almost to the top: a bush on it soon reaches the lid.
    const w = emptyWorld(8);
    for (let y = 14; y < H; y++)
      for (let x = 0; x < W; x++) {
        setCell(w, at(x, y), SOIL);
        w.wet[at(x, y)] = 130;
        w.food[at(x, y)] = 6;
      }
    setCell(w, at(70, 13), SEED);
    w.kind[at(70, 13)] = 2;
    w.food[at(70, 13)] = 1;
    stepWorldN(w, 3000);
    const lid = w.plants.flatMap((p) => p.cells.filter((i) => i < 2 * W && w.type[i] === STEM));
    expect(lid.length).toBeGreaterThan(3);
    // Along the lid, not just up against it.
    const xs = lid.map((i) => i % W);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3);
  });

  it("dries out and turns to litter without water", () => {
    const w = bed(130);
    stepWorldN(w, 600);
    expect(w.plants.length).toBe(1);
    const p = w.plants[0];
    const roots = p.cells.filter((i) => w.type[i] === ROOT);
    const shoot = p.cells.length - roots.length;
    for (let i = 0; i < w.wet.length; i++) w.wet[i] = 0;
    w.humidity = 0;
    // The dew it breathes out keeps it going a little longer, but not for long.
    for (let k = 0; k < 90 && w.plants.length > 0; k++) stepWorldN(w, 10);
    expect(w.plants.length).toBe(0);
    // The shoot becomes litter; the roots, which grew where there was soil, become soil again.
    expect(count(w, WASTE)).toBeGreaterThanOrEqual(shoot);
    for (const i of roots) expect(w.type[i]).toBe(SOIL);
  });
});

describe("shade", () => {
  /** Light below a band of `rows` rows of type t across the whole glass. */
  const below = (t: number, rows: number) => {
    const w = emptyWorld(6);
    for (let y = 40; y < 40 + rows; y++) for (let x = 0; x < W; x++) setCell(w, at(x, y), t);
    computeLight(w);
    return w.light[at(W >> 1, 100)];
  };

  it("comes from the leaves: the denser they are, the darker below", () => {
    expect(below(LEAF, 2)).toBeLessThan(200);
    expect(below(LEAF, 6)).toBeLessThan(below(LEAF, 2));
    // Stems, seeds, dead leaves and animals hardly shade at all.
    expect(below(STEM, 6)).toBeGreaterThan(200);
    for (const t of [SEED, WASTE, ISOPOD]) expect(below(t, 6)).toBe(255);
  });
});

describe("the closed glass", () => {
  it("keeps a true nutrient ledger: plants add from light, the rest only moves or is burnt", () => {
    const w = createWorld(42);
    const ledger = unitLedger(w);
    const units = totalUnits(w);
    for (let k = 0; k < 10; k++) {
      stepWorldN(w, 600);
      expect(unitLedger(w)).toBe(ledger);
    }
    // Plants have made more than has been burnt: the glass has grown richer.
    expect(w.fixed).toBeGreaterThan(w.burned);
    expect(totalUnits(w)).toBeGreaterThan(units);
  });

  it("never creates or loses water, apart from what escapes", () => {
    const w = createWorld(43);
    const water = totalWater(w);
    stepWorldN(w, 3000);
    expect(totalWater(w) + w.lostWater).toBe(water);
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
