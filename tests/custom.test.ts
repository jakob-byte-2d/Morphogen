import { describe, expect, it } from "vitest";
import { addCreatureSpecies, addPlantSpecies, applyTool, createWorld, MAX_SPECIES, SEED, stepWorldN, W, WORM } from "../src/sim";

describe("species the player makes", () => {
  it("can be sown and grow", () => {
    const w = createWorld(31);
    const k = addPlantSpecies(w, { name: "Kjempe", form: "flower", height: 30, colors: { leaf: "#3366aa", flower: "#ffcc00" } });
    expect(k).toBe(3);
    expect(w.plantSpecies[k].colors.leaf).toBe("#3366aa");
    for (let n = 0; n < 40; n++) applyTool(w, "seed", 22, 30, k);
    expect([...w.type.keys()].some((i) => w.type[i] === SEED && w.kind[i] === k)).toBe(true);
    stepWorldN(w, 900);
    expect(w.plants.some((p) => p.species === k)).toBe(true);
  });

  it("live the way their food decides", () => {
    const w = createWorld(32);
    const k = addCreatureSpecies(w, { name: "Gravemus", diet: "waste", color: "#aa8866" });
    applyTool(w, "creature", 60, 20, k);
    const c = w.creatures.find((x) => x.species === k);
    expect(c).toBeDefined();
    expect(c!.cells.every((i) => w.type[i] === WORM)).toBe(true);
    expect(((c!.cells[0] / W) | 0)).toBeGreaterThan(60);
  });

  it("are cleaned up and limited in number", () => {
    const w = createWorld(33);
    const k = addCreatureSpecies(w, { diet: "everything", color: "javascript:" });
    expect(w.creatureSpecies[k].diet).toBe("plants");
    expect(w.creatureSpecies[k].color).toMatch(/^#[0-9a-f]{6}$/);
    while (addPlantSpecies(w, {}) >= 0);
    expect(w.plantSpecies.length).toBe(MAX_SPECIES);
  });
});
