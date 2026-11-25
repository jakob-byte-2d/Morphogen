import { describe, expect, it } from "vitest";
import {
  applyTool,
  createWorld,
  EMPTY,
  GOLDEN,
  H,
  SCALE,
  hashWorld,
  SAND,
  setCell,
  SIM_VERSION,
  SOIL,
  stepWorld,
  stepWorldN,
  STONE,
  W,
  WATER,
  computeLight,
} from "../src/sim";
import { emptyWorld } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: ReturnType<typeof emptyWorld>, t: number) => w.type.filter((v) => v === t).length;

describe("falling and flowing", () => {
  it("drops sand to the bottom and piles it up", () => {
    const w = emptyWorld(1);
    for (let y = 0; y < 10; y++) setCell(w, at(36, y), SAND);
    stepWorldN(w, 300);
    expect(count(w, SAND)).toBe(10);
    expect(w.type[at(36, H - 1)]).toBe(SAND);
    // A pile, not a tower: it has spread out sideways.
    let tallest = 0;
    for (let y = 0; y < H; y++) if (w.type[at(36, y)] === SAND) tallest++;
    expect(tallest).toBeLessThan(10);
  });

  it("lets water spread out over a stone floor", () => {
    const w = emptyWorld(2);
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
    for (let y = 0; y < 8; y++) setCell(w, at(36, y), WATER);
    stepWorldN(w, 400);
    // A drop may have evaporated into the air; nothing else is lost.
    expect(count(w, WATER) * 32 + w.humidity + w.lostWater).toBe(8 * 32);
    let onFloor = 0;
    for (let x = 0; x < W; x++) if (w.type[at(x, H - 2)] === WATER) onFloor++;
    expect(onFloor).toBe(count(w, WATER));
    expect(onFloor).toBeGreaterThan(5);
  });

  it("soaks water into dry soil", () => {
    const w = emptyWorld(3);
    for (let x = 0; x < W; x++) for (let y = H - 10; y < H; y++) setCell(w, at(x, y), SOIL);
    for (let y = 0; y < 5; y++) setCell(w, at(20, y), WATER);
    stepWorldN(w, 300);
    expect(count(w, WATER)).toBe(0);
    let wet = 0;
    for (let i = 0; i < w.wet.length; i++) wet += w.wet[i];
    expect(wet).toBe(5 * 32);
  });

  it("sinks sand through water", () => {
    const w = emptyWorld(4);
    for (let x = 30; x < 40; x++) for (let y = H - 6; y < H; y++) setCell(w, at(x, y), WATER);
    for (let x = 0; x < 30; x++) setCell(w, at(x, H - 1), STONE);
    for (let x = 40; x < W; x++) setCell(w, at(x, H - 1), STONE);
    setCell(w, at(35, 0), SAND);
    stepWorldN(w, 200);
    expect(w.type[at(35, H - 1)] === SAND || count(w, SAND) === 1).toBe(true);
    let sandY = -1;
    for (let i = 0; i < w.type.length; i++) if (w.type[i] === SAND) sandY = (i / W) | 0;
    expect(sandY).toBeGreaterThan(H - 4);
  });
});

describe("light", () => {
  it("is full in open air and blocked by stone", () => {
    const w = emptyWorld(5);
    setCell(w, at(30, 40), STONE);
    computeLight(w);
    expect(w.light[at(10, 100)]).toBe(255);
    // Light comes from the upper left, so the shadow falls down and to the right.
    expect(w.light[at(30, 41)]).toBe(0);
    expect(w.light[at(33, 50)]).toBe(0);
    expect(w.light[at(27, 50)]).toBe(255);
  });

  it("dims a little through water", () => {
    const w = emptyWorld(6);
    for (let y = 20; y < 30; y++) setCell(w, at(10, y), WATER);
    computeLight(w);
    const below = w.light[at(10 + 10, 50)];
    expect(below).toBeLessThan(255);
    expect(below).toBeGreaterThan(100);
  });
});

describe("tools", () => {
  it("pours water and soil into empty cells only", () => {
    const w = emptyWorld(7);
    setCell(w, at(20, 20), STONE);
    for (let k = 0; k < 20; k++) applyTool(w, "water", 20, 20);
    expect(w.type[at(20, 20)]).toBe(STONE);
    expect(count(w, WATER)).toBeGreaterThan(0);
    for (let k = 0; k < 20; k++) applyTool(w, "soil", 50, 20);
    expect(count(w, SOIL)).toBeGreaterThan(0);
  });

  it("digs everything away with the spade", () => {
    const w = createWorld(8);
    const i = at(8 * SCALE, 110 * SCALE);
    expect(w.type[i]).not.toBe(EMPTY);
    applyTool(w, "spade", 8 * SCALE, 110 * SCALE);
    expect(w.type[i]).toBe(EMPTY);
  });
});

describe("determinism", () => {
  const run = (seed: number) => {
    const w = createWorld(seed);
    for (let k = 0; k < 1500; k++) {
      if (k % 7 === 0 && k < 600) applyTool(w, "water", 10 + (k % 30), 30);
      if (k % 11 === 0 && k < 900) applyTool(w, "soil", 60, 20);
      if (k === 1000) applyTool(w, "spade", 36, 90);
      stepWorld(w);
    }
    return hashWorld(w);
  };

  it("gives the same glass for the same seed and the same actions", () => {
    expect(run(11)).toBe(run(11));
  });

  it("gives different glasses for different seeds", () => {
    expect(run(11)).not.toBe(run(12));
  });

  it("matches the golden fingerprint", () => {
    expect(GOLDEN.simVersion).toBe(SIM_VERSION);
    const w = createWorld(GOLDEN.seed);
    stepWorldN(w, GOLDEN.ticks);
    expect(hashWorld(w)).toBe(GOLDEN.hash);
  });
});

describe("start scene", () => {
  it("has soil in the bottom quarter and a pond that stays, and no sand or stones", () => {
    const w = createWorld(42);
    expect(count(w, SOIL)).toBeGreaterThan(W * H * 0.15);
    expect(count(w, SOIL)).toBeLessThan(W * H * 0.3);
    expect(count(w, SAND)).toBe(0);
    expect(count(w, STONE)).toBe(0);
    const water = count(w, WATER);
    expect(water).toBeGreaterThan(20);
    stepWorldN(w, 3000);
    expect(count(w, WATER)).toBeGreaterThan(water * 0.7);
  });
});
