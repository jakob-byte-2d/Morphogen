import { describe, expect, it } from "vitest";
import {
  ISOPOD,
  applyTool,
  createWorld,
  EMPTY,
  FEED,
  H,
  SCALE,
  LEAF,
  setCell,
  SLIME,
  SOIL,
  spawnCreature,
  stepWorldN,
  STEM,
  STONE,
  unitLedger,
  W,
  WASTE,
} from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: World, t: number) => w.type.filter((v) => v === t).length;

/** Flat stone floor at the bottom row. */
function floor(): World {
  const w = emptyWorld(5);
  for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
  return w;
}

/** Soil along the floor, with a layer of dead leaves on it. */
function litterBed(): World {
  const w = floor();
  for (let x = 0; x < W; x++) {
    setCell(w, at(x, H - 2), SOIL);
    w.food[at(x, H - 2)] = 0;
  }
  for (let x = 10; x < 60; x++) {
    setCell(w, at(x, H - 3), WASTE);
    w.food[at(x, H - 3)] = 2;
  }
  return w;
}

const soilFood = (w: World) => w.food.reduce((n, f, i) => (w.type[i] === SOIL ? n + f : n), 0);

describe("skrukketroll", () => {
  it("eat dead leaves, leave droppings in the soil, and multiply", () => {
    const w = litterBed();
    const litter = count(w, WASTE);
    spawnCreature(w, 0, [at(30, H - 4)], 120);
    const ledger = unitLedger(w);
    stepWorldN(w, 3000);
    expect(count(w, WASTE)).toBeLessThan(litter);
    expect(w.creatures.length).toBeGreaterThan(1);
    // Half of what they eat is burnt, the rest ends up in the soil.
    expect(w.burned).toBeGreaterThan(0);
    expect(soilFood(w)).toBeGreaterThan(0);
    expect(unitLedger(w)).toBe(ledger);
  });

  it("leave living plants alone", () => {
    const w = floor();
    // A hedge of leaves along the floor (living, or as good as).
    for (let x = 10; x < 60; x++) for (let y = H - 4; y < H - 1; y++) {
      setCell(w, at(x, y), LEAF);
      w.food[at(x, y)] = 2;
    }
    const leaves = count(w, LEAF);
    spawnCreature(w, 0, [at(5, H - 2)], 400);
    stepWorldN(w, 600);
    expect(count(w, LEAF)).toBe(leaves);
  });

  it("starve to litter without food", () => {
    const w = floor();
    spawnCreature(w, 0, [at(30, H - 2)], 50);
    stepWorldN(w, 1000);
    expect(w.creatures.length).toBe(0);
    expect(count(w, WASTE)).toBe(1);
  });

  it("die of old age", () => {
    const w = floor();
    // Plenty of energy, but not forever young: about eight minutes.
    spawnCreature(w, 0, [at(30, H - 2)], 50000);
    stepWorldN(w, 3000);
    expect(w.creatures.length).toBe(1);
    stepWorldN(w, 3000);
    expect(w.creatures.length).toBe(0);
  });
});

describe("slime", () => {
  it("creeps over to feed and eats it", () => {
    const w = floor();
    setCell(w, at(42, H - 2), FEED);
    w.food[at(42, H - 2)] = 2;
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2), at(31, H - 3)], 320);
    stepWorldN(w, 600);
    expect(count(w, FEED)).toBe(0);
    // Of the two units of feed, one was burnt and one went into its body or its store.
    expect(w.burned).toBe(1);
    expect(count(w, SLIME) + w.creatures[0].store).toBe(5);
  });

  it("eats skrukketroll it reaches", () => {
    const w = floor();
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2), at(31, H - 3)], 320);
    spawnCreature(w, 0, [at(38, H - 2)], 2000);
    stepWorldN(w, 600);
    expect(count(w, ISOPOD)).toBe(0);
    expect(count(w, SLIME)).toBeGreaterThan(0);
  });

  it("stays low on the ground", () => {
    const w = floor();
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2)], 3000);
    w.creatures[0].store = 30;
    stepWorldN(w, 600);
    let top = H;
    for (let i = 0; i < W * H; i++) if (w.type[i] === SLIME) top = Math.min(top, (i / W) | 0);
    expect(H - 1 - top).toBeLessThanOrEqual(3);
  });

  it("dies of old age, as food for the skrukketroll", () => {
    const w = floor();
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2)], 1e6);
    stepWorldN(w, 6000);
    expect(count(w, SLIME)).toBeGreaterThan(0);
    stepWorldN(w, 9000);
    expect(count(w, SLIME)).toBe(0);
    expect(count(w, WASTE)).toBeGreaterThan(0);
  });

  it("flows on between plant stems", () => {
    const w = floor();
    // A row of stems in its way, and feed beyond them.
    for (let x = 40; x < 80; x += 3) for (let y = H - 12; y < H - 1; y++) setCell(w, at(x, y), STEM);
    setCell(w, at(90, H - 2), FEED);
    w.food[at(90, H - 2)] = 2;
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2), at(31, H - 3)], 2000);
    stepWorldN(w, 1500);
    expect(count(w, FEED)).toBe(0);
  });
});

describe("feed", () => {
  it("goes off into litter if nobody eats it", () => {
    const w = floor();
    for (let k = 0; k < 30; k++) applyTool(w, "feed", 36, 40);
    const fed = count(w, FEED);
    expect(fed).toBeGreaterThan(3);
    stepWorldN(w, 700);
    expect(count(w, FEED)).toBe(0);
    expect(count(w, WASTE)).toBeGreaterThan(fed - 3);
  });
});

describe("creature tool", () => {
  it("lets creatures go on whatever is below the finger", () => {
    const w = floor();
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 2), SOIL);
    applyTool(w, "creature", 20, 10, 0);
    applyTool(w, "creature", 50, 10, 1);
    expect(w.creatures.length).toBeGreaterThanOrEqual(2);
    // They land on the soil: a low mound at most, nothing left hanging in the air.
    for (const c of w.creatures) for (const i of c.cells) expect((i / W) | 0).toBeGreaterThan(H - 4 - 2 * SCALE);
    expect(w.type[at(20, 10)]).toBe(EMPTY);
  });
});

describe("the closed glass with creatures", () => {
  it("keeps its nutrient ledger", () => {
    const w = createWorld(42);
    stepWorldN(w, 900);
    applyTool(w, "creature", 22, 40, 0);
    applyTool(w, "creature", 52, 40, 0);
    applyTool(w, "creature", 40, 60, 1);
    const ledger = unitLedger(w);
    for (let k = 0; k < 8; k++) {
      stepWorldN(w, 600);
      expect(unitLedger(w)).toBe(ledger);
    }
  });
});
