import { describe, expect, it } from "vitest";
import { addCreatureSpecies, addPlantSpecies, applyTool, APHID, createWorld, MAX_SPECIES, SCALE, SEED, SLIME, stepWorldN } from "../src/sim";

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
    const bug = addCreatureSpecies(w, { name: "Lus", diet: "plants", color: "#aa8866" });
    const mass = addCreatureSpecies(w, { name: "Grøt", diet: "creatures", color: "#88aa66" });
    applyTool(w, "creature", 10 * SCALE, 20 * SCALE, bug);
    applyTool(w, "creature", 64 * SCALE, 20 * SCALE, mass);
    const b = w.creatures.find((x) => x.species === bug);
    const m = w.creatures.find((x) => x.species === mass);
    expect(b!.cells.every((i) => w.type[i] === APHID)).toBe(true);
    expect(m!.cells.every((i) => w.type[i] === SLIME)).toBe(true);
    expect(m!.cells.length).toBeGreaterThan(1);
  });

  it("are cleaned up and limited in number", () => {
    const w = createWorld(33);
    const k = addCreatureSpecies(w, { diet: "everything", color: "javascript:" });
    expect(w.creatureSpecies[k].diet).toBe("plants");
    // Worms are gone: an old waste eater becomes a plant eater.
    expect(w.creatureSpecies[addCreatureSpecies(w, { diet: "waste" })].diet).toBe("plants");
    expect(w.creatureSpecies[k].color).toMatch(/^#[0-9a-f]{6}$/);
    while (addPlantSpecies(w, {}) >= 0);
    expect(w.plantSpecies.length).toBe(MAX_SPECIES);
  });
});
