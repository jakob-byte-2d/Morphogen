import { describe, expect, it } from "vitest";
import { applyTool, createWorld, hashWorld, loadWorld, saveWorld, stepWorldN } from "../src/sim";

describe("saving a glass", () => {
  it("carries on exactly as if it had never been saved", () => {
    const a = createWorld(5);
    stepWorldN(a, 1500);
    applyTool(a, "creature", 22, 40, 0);
    applyTool(a, "creature", 40, 60, 1);
    stepWorldN(a, 1500);
    const b = loadWorld(JSON.parse(JSON.stringify(saveWorld(a))));
    expect(b).not.toBeNull();
    expect(hashWorld(b!)).toBe(hashWorld(a));
    stepWorldN(a, 2000);
    stepWorldN(b!, 2000);
    expect(hashWorld(b!)).toBe(hashWorld(a));
  });

  it("refuses damaged or foreign data", () => {
    expect(loadWorld(null)).toBeNull();
    expect(loadWorld({ v: 999 })).toBeNull();
    const good = saveWorld(createWorld(1));
    expect(loadWorld({ ...good, cells: { ...good.cells, type: "%%%" } })).toBeNull();
  });

  it("cleans up odd values instead of trusting them", () => {
    const data = saveWorld(createWorld(2));
    data.plants = [{ id: 7, species: 99, cells: [-5, 1e9, "x"], tips: [{ i: 1e9 }] }];
    data.plantSpecies = [{ name: "Rar", height: 1e6 }];
    const w = loadWorld(data)!;
    expect(w).not.toBeNull();
    expect(w.plants[0].species).toBe(0);
    expect(w.plants[0].cells.every((i) => i >= 0 && i < w.type.length)).toBe(true);
    expect(w.plantSpecies[0].height).toBe(40);
    stepWorldN(w, 50);
  });
});
