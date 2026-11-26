import { describe, expect, it } from "vitest";
import { sownGlass } from "./helpers";
import { applyTool, createWorld, EMPTY, hashWorld, ISOPOD, loadWorld, saveWorld, stepLifeN, stepWorldN, totalUnits, WASTE } from "../src/sim";

describe("saving a glass", () => {
  it("carries on exactly as if it had never been saved", () => {
    const a = sownGlass(5);
    stepLifeN(a, 1500);
    applyTool(a, "creature", 22, 40, 0);
    applyTool(a, "creature", 40, 60, 0);
    stepLifeN(a, 1500);
    stepWorldN(a, 777);
    const b = loadWorld(JSON.parse(JSON.stringify(saveWorld(a))));
    expect(b).not.toBeNull();
    expect(hashWorld(b!)).toBe(hashWorld(a));
    stepLifeN(a, 2000);
    stepLifeN(b!, 2000);
    stepWorldN(a, 2000);
    stepWorldN(b!, 2000);
    expect(hashWorld(b!)).toBe(hashWorld(a));
  });

  it("moves the skrukketroll of an older glass (cells in the grid) onto their own layer", () => {
    const w = createWorld(6);
    applyTool(w, "creature", 30, 40, 0);
    applyTool(w, "creature", 110, 40, 0);
    const units = totalUnits(w);
    const data = saveWorld(w);
    // As version 17 saved it: each one a cell of its own, with a unit in it.
    const bytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const text = (a: Uint8Array) => {
      let out = "";
      for (let k = 0; k < a.length; k += 4096) out += String.fromCharCode(...a.subarray(k, k + 4096));
      return btoa(out);
    };
    const type = bytes(data.cells.type);
    const food = bytes(data.cells.food);
    const org = bytes(data.cells.org);
    for (const c of data.creatures as { id: number; cells: number[]; store: number }[]) {
      const i = c.cells[0];
      type[i] = ISOPOD;
      food[i] = 1;
      org[2 * i] = c.id & 255;
      org[2 * i + 1] = c.id >> 8;
      c.store = 0;
    }
    // And one left behind with no creature to it.
    type[100] = ISOPOD;
    food[100] = 1;
    data.cells = { ...data.cells, type: text(type), food: text(food), org: text(org) };
    data.v = 17;
    const back = loadWorld(data)!;
    expect(back.creatures.length).toBe(2);
    for (const c of back.creatures) {
      expect(back.type[c.cells[0]]).toBe(EMPTY);
      expect(back.critter[c.cells[0]]).toBe(c.id);
      expect(c.store).toBe(1);
    }
    expect(back.type.includes(ISOPOD)).toBe(false);
    expect(back.type[100]).toBe(WASTE);
    expect(totalUnits(back)).toBe(units + 1);
    stepLifeN(back, 100);
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
