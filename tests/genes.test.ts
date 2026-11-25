import { describe, expect, it } from "vitest";
import {
  addPlantSpecies,
  applyTool,
  createWorld,
  creatureGenesOf,
  FEED,
  H,
  hashWorld,
  inheritCreature,
  inheritPlant,
  loadWorld,
  MAX_ORG_ID,
  normalizeCreatureSpecies,
  normalizePlantSpecies,
  packSeed,
  plantGenesOf,
  saveWorld,
  SEED,
  SEED_GENES,
  setCell,
  SOIL,
  spawnCreature,
  stepWorld,
  stepWorldN,
  STONE,
  unpackSeed,
  W,
  type CreatureGenes,
  type PlantGenes,
} from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;

function soilBed(): World {
  const w = emptyWorld(9);
  for (let y = H - 30; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = 140;
      w.food[at(x, y)] = 6;
    }
  return w;
}

function sow(w: World, x: number, species: number, genes: PlantGenes): void {
  const i = at(x, H - 31);
  setCell(w, i, SEED);
  w.kind[i] = species;
  w.food[i] = 1;
  w.org[i] = packSeed(genes);
}

describe("species traits", () => {
  it("default to the middle and are kept within bounds", () => {
    const p = normalizePlantSpecies({ traits: { growth: 9, seed: -3 } });
    expect(p.traits).toEqual({ growth: 5, seed: 1, mutation: 1 });
    const c = normalizeCreatureSpecies({ traits: { speed: "fast", mutation: 7 } });
    expect(c.traits).toEqual({ size: 3, speed: 3, growth: 3, mutation: 5 });
    // Species saved before traits existed still work.
    expect(normalizeCreatureSpecies({ name: "Gammel", diet: "plants" }).traits.speed).toBe(3);
  });
});

describe("inheritance", () => {
  it("copies genes exactly without mutation", () => {
    const w = emptyWorld(1);
    const g: CreatureGenes = { size: 2, speed: 4, growth: 5, mutation: 0, tint: 3 };
    for (let k = 0; k < 200; k++) expect(inheritCreature(w, g)).toEqual(g);
    const p: PlantGenes = { growth: 1, seed: 5, mutation: 0, tint: -2 };
    for (let k = 0; k < 200; k++) expect(inheritPlant(w, p)).toEqual(p);
  });

  it("now and then changes one trait by one step, and drifts the colour", () => {
    const w = emptyWorld(2);
    const g: CreatureGenes = { size: 3, speed: 3, growth: 3, mutation: 5, tint: 0 };
    let changed = 0;
    for (let k = 0; k < 400; k++) {
      const c = inheritCreature(w, g);
      const diffs = (["size", "speed", "growth", "mutation"] as const).filter((t) => c[t] !== g[t]);
      expect(diffs.length).toBeLessThanOrEqual(1);
      for (const t of diffs) expect(Math.abs(c[t] - g[t])).toBe(1);
      if (diffs.length > 0) {
        changed++;
        expect(c.tint).not.toBe(0);
      }
    }
    // Mutation 5 is a change in about half the young.
    expect(changed).toBeGreaterThan(120);
    expect(changed).toBeLessThan(280);
  });
});

describe("seeds", () => {
  it("carry their genes packed in the cell", () => {
    const g: PlantGenes = { growth: 5, seed: 1, mutation: 4, tint: -15 };
    const v = packSeed(g);
    expect(v & SEED_GENES).toBe(SEED_GENES);
    expect(v).toBeLessThan(65536);
    expect(unpackSeed(v, plantGenesOf(normalizePlantSpecies({})))).toEqual(g);
    // A seed without genes gets its species' own.
    const sp = normalizePlantSpecies({ traits: { growth: 2 } });
    expect(unpackSeed(0, plantGenesOf(sp)).growth).toBe(2);
  });

  it("grow into plants with those genes, and pass them on", () => {
    const w = soilBed();
    sow(w, W >> 1, 1, { growth: 4, seed: 2, mutation: 0, tint: 7 });
    stepWorldN(w, 3000);
    const p = w.plants.find((x) => x.genes.tint === 7);
    expect(p?.genes).toEqual({ growth: 4, seed: 2, mutation: 0, tint: 7 });
    // Its seeds (and the plants they became) carry the same genes.
    const seeds = [...w.type.keys()].filter((i) => w.type[i] === SEED);
    for (const i of seeds) expect(unpackSeed(w.org[i], plantGenesOf(w.plantSpecies[1]))).toEqual(p!.genes);
    for (const q of w.plants) expect(q.genes).toEqual(p!.genes);
    expect(w.plants.length + seeds.length).toBeGreaterThan(1);
  });

  it("never share a number with an organism", () => {
    const w = createWorld(3);
    w.nextOrgId = MAX_ORG_ID - 2;
    for (let k = 0; k < 6; k++) applyTool(w, "creature", 40 + k * 10, 20, 0);
    for (const c of w.creatures) expect(c.id).toBeLessThanOrEqual(MAX_ORG_ID);
    expect(w.creatures.some((c) => c.id < 10)).toBe(true);
  });
});

describe("what the genes do", () => {
  it("fast-growing plants grow faster", () => {
    const grown = (growth: number) => {
      const w = soilBed();
      sow(w, W >> 1, 2, { growth, seed: 3, mutation: 0, tint: 0 });
      stepWorldN(w, 900);
      return w.plants[0].cells.length;
    };
    expect(grown(5)).toBeGreaterThan(grown(1));
  });

  it("fast creatures get there sooner, and pay for it", () => {
    const run = (speed: number) => {
      const w = emptyWorld(4);
      for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
      setCell(w, at(70, H - 2), FEED);
      w.food[at(70, H - 2)] = 2;
      spawnCreature(w, 1, [at(50, H - 2)], 2000, { size: 3, speed, growth: 3, mutation: 0, tint: 0 });
      let t = 0;
      while (w.type[at(70, H - 2)] === FEED && t < 3000) {
        stepWorld(w);
        t++;
      }
      return t;
    };
    const tired = (speed: number) => {
      const w = emptyWorld(4);
      for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
      const c = spawnCreature(w, 0, [at(W >> 1, H - 2)], 2000, { size: 3, speed, growth: 3, mutation: 0, tint: 0 })!;
      stepWorldN(w, 200);
      return 2000 - c.energy;
    };
    expect(run(5) * 2).toBeLessThan(run(1));
    expect(tired(5)).toBeGreaterThan(tired(1) * 3);
  });

  it("small-bodied slime splits sooner", () => {
    const largest = (size: number) => {
      const w = emptyWorld(5);
      for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
      const c = spawnCreature(w, 1, [at(70, H - 2)], 30000, { size, speed: 3, growth: 5, mutation: 0, tint: 0 })!;
      c.store = 400;
      let max = 0;
      for (let t = 0; t < 4000 && w.creatures.length === 1; t++) {
        stepWorld(w);
        max = Math.max(max, c.cells.length);
      }
      expect(w.creatures.length).toBe(2);
      return max;
    };
    expect(largest(1)).toBeLessThan(largest(5));
  });
});

describe("saving genes", () => {
  it("keeps genes, seeds and light, and carries on exactly from any step", () => {
    const a = createWorld(12);
    addPlantSpecies(a, { name: "Rask", form: "grass", traits: { growth: 5, seed: 1, mutation: 3 } });
    for (let n = 0; n < 30; n++) applyTool(a, "seed", 40, 30, 3);
    stepWorldN(a, 1203);
    applyTool(a, "creature", 60, 30, 0);
    stepWorldN(a, 600);
    expect(a.tick % 4).not.toBe(0);
    const b = loadWorld(JSON.parse(JSON.stringify(saveWorld(a))))!;
    expect(hashWorld(b)).toBe(hashWorld(a));
    expect(b.plants.map((p) => p.genes)).toEqual(a.plants.map((p) => p.genes));
    stepWorldN(a, 1000);
    stepWorldN(b, 1000);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it("gives saved organisms without genes their species' own", () => {
    const w = createWorld(13);
    stepWorldN(w, 600);
    const data = JSON.parse(JSON.stringify(saveWorld(w)));
    for (const c of data.creatures) delete c.genes;
    const back = loadWorld(data)!;
    for (const c of back.creatures) expect(c.genes).toEqual(creatureGenesOf(back.creatureSpecies[c.species]));
  });
});
