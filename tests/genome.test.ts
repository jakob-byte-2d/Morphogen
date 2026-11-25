import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENOME,
  GENOME_LIMITS,
  createWorld,
  normalizeGenome,
  stepWorldN,
} from "../src/engine";
import { PRESETS, PRESET_IDS } from "../src/genome/presets";

describe("normalizeGenome", () => {
  it("turns garbage into a valid one-mode genome", () => {
    for (const raw of [null, undefined, 42, "genome", [], {}, { modes: "x" }]) {
      const g = normalizeGenome(raw);
      expect(g.modes.length).toBe(1);
      expect(g.startMode).toBe(0);
      expect(g.modes[0].cellType).toBe("eater");
    }
  });

  it("clamps numbers and fixes broken fields", () => {
    const g = normalizeGenome({
      name: "x".repeat(100),
      startMode: 9,
      modes: [
        { splitMass: 5, childModes: [7, -3], cellType: "dragon", color: "red" },
        { splitMass: 9999, splitAngle: 7, childTurns: [Number.NaN, "a"], canSplit: "yes" },
      ],
    });
    expect(g.name.length).toBe(GENOME_LIMITS.maxNameLength);
    expect(g.startMode).toBe(1);
    const [a, b] = g.modes;
    expect(a.splitMass).toBe(GENOME_LIMITS.minSplitMass);
    expect(a.childModes).toEqual([1, 0]);
    expect(a.cellType).toBe("eater");
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b.splitMass).toBe(GENOME_LIMITS.maxSplitMass);
    expect(Math.abs(b.splitAngle)).toBeLessThanOrEqual(Math.PI);
    expect(b.childTurns.every(Number.isFinite)).toBe(true);
    expect(b.canSplit).toBe(true);
  });

  it("keeps at most the allowed number of modes", () => {
    const g = normalizeGenome({ modes: Array.from({ length: 50 }, () => ({})) });
    expect(g.modes.length).toBe(GENOME_LIMITS.maxModes);
  });

  it("is idempotent, and the presets are already valid", () => {
    const once = normalizeGenome({ modes: [{ splitMass: 3, childModes: [4, 4] }, {}] });
    expect(normalizeGenome(once)).toEqual(once);
    for (const id of PRESET_IDS) expect(normalizeGenome(PRESETS[id])).toEqual(PRESETS[id]);
  });

  it("survives a JSON round trip unchanged", () => {
    const g = normalizeGenome(DEFAULT_GENOME);
    expect(normalizeGenome(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });
});

describe("species", () => {
  it.each(PRESET_IDS)("the preset organism %s survives and grows", (id) => {
    const w = createWorld(3, { genomes: [PRESETS[id]] });
    stepWorldN(w, 15000);
    expect(w.cells.length).toBeGreaterThan(10);
  });

  it("two species start mirrored, keep their own cells and never bond to each other", () => {
    const w = createWorld(8, { genomes: [PRESETS.klump, PRESETS.alge] });
    const [a, b] = w.cells;
    expect(a.x).toBeCloseTo(-b.x, 9);
    expect(a.y).toBeCloseTo(-b.y, 9);
    expect([a.species, b.species]).toEqual([0, 1]);

    stepWorldN(w, 9000);
    const species = new Map(w.cells.map((c) => [c.id, c.species]));
    expect(new Set(species.values())).toEqual(new Set([0, 1]));
    for (const bond of w.bonds) expect(species.get(bond.a)).toBe(species.get(bond.b));
    for (const c of w.cells) {
      expect(c.type).toBe(w.genomes[c.species].modes[c.mode].cellType);
    }
  });
});
