import { describe, expect, it } from "vitest";
import { addCreatureSpecies, addPlantSpecies, applyTool, ISOPOD, createWorld, MAX_SPECIES, SCALE, SEED, stepLifeN } from "../src/sim";

describe("species the player makes", () => {
  it("can be sown and grow", () => {
    const w = createWorld(31);
    const k = addPlantSpecies(w, { name: "Kjempe", form: "flower", height: 30, colors: { leaf: "#3366aa", flower: "#ffcc00" } });
    expect(k).toBe(3);
    expect(w.plantSpecies[k].colors.leaf).toBe("#3366aa");
    for (let n = 0; n < 40; n++) applyTool(w, "seed", 22, 30, k);
    expect([...w.type.keys()].some((i) => w.type[i] === SEED && w.kind[i] === k)).toBe(true);
    stepLifeN(w, 900);
    expect(w.plants.some((p) => p.species === k)).toBe(true);
  });

  it("are all plant eaters living on the ground, whatever they ate before", () => {
    const w = createWorld(32);
    const bug = addCreatureSpecies(w, { name: "Lus", diet: "plants", color: "#aa8866" });
    const mass = addCreatureSpecies(w, { name: "Grøt", diet: "creatures", color: "#88aa66" });
    expect(w.creatureSpecies[mass].diet).toBe("litter");
    applyTool(w, "creature", 10 * SCALE, 20 * SCALE, bug);
    applyTool(w, "creature", 64 * SCALE, 20 * SCALE, mass);
    for (const k of [bug, mass]) {
      const c = w.creatures.filter((x) => x.species === k);
      expect(c.length).toBeGreaterThan(0);
      expect(c.every((x) => x.cells.length === 1 && w.type[x.cells[0]] === ISOPOD)).toBe(true);
    }
  });

  it("are cleaned up and limited in number", () => {
    const w = createWorld(33);
    const k = addCreatureSpecies(w, { diet: "everything", color: "javascript:" });
    expect(w.creatureSpecies[k].diet).toBe("litter");
    // Worms, plant eaters and slime are gone: they all become litter eaters.
    expect(w.creatureSpecies[addCreatureSpecies(w, { diet: "waste" })].diet).toBe("litter");
    expect(w.creatureSpecies[addCreatureSpecies(w, { diet: "plants" })].diet).toBe("litter");
    expect(w.creatureSpecies[k].color).toMatch(/^#[0-9a-f]{6}$/);
    while (addPlantSpecies(w, {}) >= 0);
    expect(w.plantSpecies.length).toBe(MAX_SPECIES);
  });
});
