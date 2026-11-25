import { describe, expect, it } from "vitest";
import { DEFAULT_GENOME, normalizeGenome } from "../src/engine";
import { canonical, decodeGenome, encodeGenome } from "../src/genome/codec";
import { addMode, removeMode, setStartMode, updateMode } from "../src/genome/edit";
import { PRESETS, PRESET_IDS } from "../src/genome/presets";

describe("genome links", () => {
  it("every preset survives a round trip through a link", () => {
    for (const id of PRESET_IDS) {
      const g = PRESETS[id];
      expect(decodeGenome(encodeGenome(g))).toEqual(canonical(g));
    }
  });

  it("links use only URL-safe characters", () => {
    expect(encodeGenome(PRESETS.blanding)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps names with Norwegian letters", () => {
    const g = normalizeGenome({ ...DEFAULT_GENOME, name: "Blåbærsyltetøy" });
    expect(decodeGenome(encodeGenome(g))?.name).toBe("Blåbærsyltetøy");
  });

  it("a canonical genome is stable", () => {
    const g = updateMode(DEFAULT_GENOME, 0, { splitAngle: 1 / 3 });
    const once = canonical(g);
    expect(canonical(once)).toEqual(once);
  });

  it("broken links give null instead of crashing", () => {
    for (const text of ["", "%%%", "bm90IGpzb24", "e30"]) {
      const result = decodeGenome(text);
      if (result !== null) expect(result.modes.length).toBeGreaterThan(0);
    }
    expect(decodeGenome("%%%")).toBeNull();
  });
});

describe("editing", () => {
  it("adds a mode that does not divide", () => {
    const g = addMode(DEFAULT_GENOME);
    expect(g.modes.length).toBe(DEFAULT_GENOME.modes.length + 1);
    expect(g.modes.at(-1)!.canSplit).toBe(false);
  });

  it("removing a mode fixes all references to it and after it", () => {
    // Default genome: 0→[1,1], 1→[2,2], 2→[3,3], 3→[3,0]
    const g = removeMode(setStartMode(DEFAULT_GENOME, 2), 1);
    expect(g.modes.length).toBe(3);
    expect(g.modes[0].childModes).toEqual([0, 0]); // pointed at the removed mode
    expect(g.modes[1].childModes).toEqual([2, 2]); // was 3, shifted down
    expect(g.modes[2].childModes).toEqual([2, 0]);
    expect(g.startMode).toBe(1);
  });

  it("never removes the last mode", () => {
    const one = normalizeGenome({ modes: [{}] });
    expect(removeMode(one, 0)).toBe(one);
  });

  it("updates one mode without touching the others", () => {
    const g = updateMode(DEFAULT_GENOME, 2, { cellType: "swim", splitMass: 9999 });
    expect(g.modes[2].cellType).toBe("swim");
    expect(g.modes[2].splitMass).toBe(400);
    expect(g.modes[0]).toEqual(DEFAULT_GENOME.modes[0]);
  });
});
