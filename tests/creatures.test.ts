import { describe, expect, it } from "vitest";
import {
  APHID,
  applyTool,
  createWorld,
  EMPTY,
  FEED,
  H,
  LEAF,
  setCell,
  SLIME,
  SOIL,
  spawnCreature,
  stepWorldN,
  STONE,
  totalUnits,
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

describe("bugs", () => {
  it("eat leaves and multiply", () => {
    const w = floor();
    // A hedge of leaves along the floor.
    for (let x = 10; x < 60; x++) for (let y = H - 4; y < H - 1; y++) {
      setCell(w, at(x, y), LEAF);
      w.food[at(x, y)] = 1;
    }
    const leaves = count(w, LEAF);
    spawnCreature(w, 0, [at(30, H - 5)], 120);
    stepWorldN(w, 1200);
    expect(count(w, LEAF)).toBeLessThan(leaves);
    expect(w.creatures.length).toBeGreaterThan(1);
  });

  it("starve to waste without food", () => {
    const w = floor();
    spawnCreature(w, 0, [at(30, H - 2)], 50);
    stepWorldN(w, 400);
    expect(w.creatures.length).toBe(0);
    expect(count(w, WASTE)).toBe(1);
  });
});

describe("slime", () => {
  it("creeps over to feed and eats it", () => {
    const w = floor();
    setCell(w, at(50, H - 2), FEED);
    w.food[at(50, H - 2)] = 2;
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2), at(31, H - 3)], 320);
    stepWorldN(w, 600);
    expect(count(w, FEED)).toBe(0);
    // The two units of feed went into its body or its store.
    expect(count(w, SLIME) + w.creatures[0].store).toBeGreaterThanOrEqual(6);
  });

  it("eats bugs it reaches", () => {
    const w = floor();
    spawnCreature(w, 1, [at(30, H - 2), at(31, H - 2), at(32, H - 2), at(31, H - 3)], 320);
    spawnCreature(w, 0, [at(38, H - 2)], 2000);
    stepWorldN(w, 600);
    expect(count(w, APHID)).toBe(0);
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
});

describe("feed", () => {
  it("rots into waste if nobody eats it", () => {
    const w = floor();
    for (let k = 0; k < 30; k++) applyTool(w, "feed", 36, 40);
    const fed = count(w, FEED);
    expect(fed).toBeGreaterThan(3);
    stepWorldN(w, 900);
    expect(count(w, FEED)).toBe(0);
    expect(count(w, WASTE)).toBe(fed);
  });
});

describe("creature tool", () => {
  it("lets creatures go on whatever is below the finger", () => {
    const w = floor();
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 2), SOIL);
    applyTool(w, "creature", 20, 10, 0);
    applyTool(w, "creature", 50, 10, 1);
    expect(w.creatures.length).toBeGreaterThanOrEqual(2);
    for (const c of w.creatures) for (const i of c.cells) expect((i / W) | 0).toBeGreaterThan(H - 6);
    expect(w.type[at(20, 10)]).toBe(EMPTY);
  });
});

describe("the closed glass with creatures", () => {
  it("never creates or loses nutrients", () => {
    const w = createWorld(42);
    stepWorldN(w, 900);
    applyTool(w, "creature", 22, 40, 0);
    applyTool(w, "creature", 52, 40, 0);
    applyTool(w, "creature", 40, 60, 1);
    const units = totalUnits(w);
    for (let k = 0; k < 8; k++) {
      stepWorldN(w, 600);
      expect(totalUnits(w)).toBe(units);
    }
  });
});
