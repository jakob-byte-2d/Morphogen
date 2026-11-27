import { describe, expect, it } from "vitest";
import { applyTool, createWorld, hashWorld, LIFE_EVERY, LIFE_PER_DAY, loadWorld, saveWorld, skip, stepWorld, type World } from "../src/sim";

/** A glass that has been looked after for a while: sown, watered, with skrukketroll in it. */
function tended(seed: number, days: number): World {
  const w = createWorld(seed);
  for (const x of [14, 24, 120, 132]) for (let k = 0; k < 6; k++) applyTool(w, "seed", x, 150, 0);
  for (const [x, sp] of [[8, 2], [34, 1], [110, 1], [126, 2]]) {
    applyTool(w, "spade", x, w.top[x]);
    for (let k = 0; k < 6; k++) applyTool(w, "seed", x, 150, sp);
  }
  for (let k = 0; k < 300; k++) stepWorld(w);
  for (let d = 1; d <= days; d++) {
    if (d === 3) for (const x of [20, 60, 120]) applyTool(w, "creature", x, 100);
    if (d % 4 === 0) for (let k = 0; k < 60; k++) applyTool(w, "water", 70, 60);
    skip(w, LIFE_PER_DAY * LIFE_EVERY);
  }
  return w;
}

describe("the glass", () => {
  it("comes out the same every time from the same seed and the same care", () => {
    const a = tended(7, 20);
    const b = tended(7, 20);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.plants.length).toBeGreaterThan(0);
    expect(a.animals.length).toBeGreaterThan(0);
    // The rules themselves: this changes only when they are changed on purpose (then bump SIM_VERSION).
    expect(hashWorld(a)).toBe("884439a0");
  });

  it("is the same after saving and loading, and goes on the same", () => {
    const w = tended(11, 10);
    const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))))!;
    expect(back).not.toBeNull();
    expect(hashWorld(back)).toBe(hashWorld(w));
    for (const g of [w, back]) {
      for (let k = 0; k < 500; k++) stepWorld(g);
      skip(g, 5 * LIFE_PER_DAY * LIFE_EVERY);
    }
    expect(hashWorld(back)).toBe(hashWorld(w));
  });
});
