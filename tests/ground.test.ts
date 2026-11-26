import { describe, expect, it } from "vitest";
import { createWorld, EMPTY, H, loadWorld, ROOT, SAND, saveWorld, setCell, SOIL, stepWorldN, STONE, W } from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;

/** Cells that make up the ground: soil and sand, and the roots living in it. */
function ground(w: World): number {
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const t = w.type[i];
    if (t === SOIL || t === SAND || t === ROOT) n++;
  }
  return n;
}

describe("the ground", () => {
  it("does not wear away as plants live and die in it", () => {
    const w = createWorld(7);
    const start = ground(w);
    stepWorldN(w, 4000);
    const now = ground(w);
    expect(now).toBeGreaterThanOrEqual(start);
    // It may build up a little (humus), but slowly.
    expect(now).toBeLessThan(start * 1.02);
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

  it("does not load glasses from before the groundwater was one level table", () => {
    const w = createWorld(8);
    stepWorldN(w, 100);
    const data = saveWorld(w);
    expect(loadWorld(JSON.parse(JSON.stringify(data)))).not.toBeNull();
    data.v = 13;
    expect(loadWorld(JSON.parse(JSON.stringify(data)))).toBeNull();
  });
});
