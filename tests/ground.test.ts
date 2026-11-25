import { describe, expect, it } from "vitest";
import { createWorld, EMPTY, H, loadWorld, ROOT, SAND, saveWorld, setCell, SOIL, spawnCreature, stepWorldN, STONE, W, WORM } from "../src/sim";
import { clearCell, emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;

/** Cells that make up the ground: soil and sand, and the roots and worms living in it. */
function ground(w: World): number {
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const t = w.type[i];
    if (t === SOIL || t === SAND || t === ROOT || t === WORM) n++;
  }
  return n;
}

describe("the ground", () => {
  it("does not wear away as plants and worms live and die in it", () => {
    const w = createWorld(7);
    const start = ground(w);
    stepWorldN(w, 4000);
    const now = ground(w);
    expect(now).toBeGreaterThanOrEqual(start);
    // It may build up a little (humus), but slowly.
    expect(now).toBeLessThan(start * 1.02);
  });

  it("gets the soil back when a worm dies", () => {
    const w = emptyWorld(3);
    for (let y = H - 20; y < H; y++) for (let x = 0; x < W; x++) setCell(w, at(x, y), SOIL);
    const cells = [at(40, H - 10), at(40, H - 9), at(40, H - 8)];
    for (const i of cells) clearCell(w, i);
    const c = spawnCreature(w, 2, cells, 1)!;
    // Starving: it shrinks, its tail turning back into soil, until it is gone.
    c.energy = -10000;
    stepWorldN(w, 40);
    expect(c.dead).toBe(true);
    for (const i of cells) expect(w.type[i]).toBe(SOIL);
  });

  it("lets a stone with nothing under it drop straight down", () => {
    const w = emptyWorld(4);
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), SOIL);
    setCell(w, at(30, H - 10), STONE);
    setCell(w, at(31, H - 2), STONE);
    stepWorldN(w, 20);
    expect(w.type[at(30, H - 2)]).toBe(STONE);
    expect(w.type[at(31, H - 2)]).toBe(STONE);
    expect(w.type[at(30, H - 10)]).toBe(EMPTY);
  });

  it("still loads glasses saved by version 7", () => {
    const w = createWorld(8);
    stepWorldN(w, 100);
    const data = saveWorld(w);
    data.v = 7;
    expect(loadWorld(JSON.parse(JSON.stringify(data)))).not.toBeNull();
    data.v = 6;
    expect(loadWorld(JSON.parse(JSON.stringify(data)))).toBeNull();
  });
});
