import { DEFAULT_GENOME, GENOME_VERSION, mode, type Genome } from "../engine";

const DEG = Math.PI / 180;

/** A budding swimmer-driven animal: a mouth cell pushed around by a swimmer. */
function swimmingAnimal(name: string, mouth: "eater" | "grazer" | "hunter", color: string): Genome {
  return {
    version: GENOME_VERSION,
    name,
    startMode: 0,
    modes: [
      // Founder mouth divides right away into a mouth (front) and a swimmer
      // (back), both facing forward, so the swimmer pushes the mouth to food.
      mode({ cellType: mouth, splitMass: 100, childModes: [1, 2], childTurns: [0, 0], color }),
      // The mouth keeps budding off new founders.
      mode({ cellType: mouth, childModes: [1, 0], makeBond: false, childKeepsBonds: [true, false], color }),
      // The swimmer never divides, it just swims.
      mode({ cellType: "swim", canSplit: false, color: "#5a96dc" }),
    ],
  };
}

/**
 * Ready-made organisms. Each mode is a recipe; comments describe what the
 * cell does. All of them can be opened and changed in the genome editor.
 */
export const PRESETS = {
  /** A plant: a seed sinks, takes root on the bottom and grows a trunk up towards the light. */
  tre: {
    version: GENOME_VERSION,
    name: "Tre",
    startMode: 0,
    modes: [
      // 0 Seed: a root cell. Sprouts once it has anchored on the bottom:
      //   the trunk tip goes up, a root stays down.
      mode({ cellType: "root", splitMass: 100, childModes: [1, 9], childTurns: [0, 0], color: "#96693c" }),
      // 1–4 Trunk tip: grows upwards, leaving a trunk cell behind each time.
      mode({ cellType: "photo", splitMass: 150, childModes: [2, 8], childTurns: [0, 0], color: "#6fae3a" }),
      mode({ cellType: "photo", splitMass: 150, childModes: [3, 8], childTurns: [0, 0], color: "#6fae3a" }),
      mode({ cellType: "photo", splitMass: 150, childModes: [4, 8], childTurns: [0, 0], color: "#6fae3a" }),
      mode({ cellType: "photo", splitMass: 150, childModes: [5, 8], childTurns: [0, 0], color: "#6fae3a" }),
      // 5 Crown: splits sideways into two branches pointing up-left and up-right.
      mode({
        cellType: "photo",
        splitMass: 150,
        splitAngle: 90 * DEG,
        childModes: [6, 6],
        childTurns: [45 * DEG, -45 * DEG],
        color: "#7cc043",
      }),
      // 6 Branch: a leaf, and a seed maker at the tip.
      mode({ cellType: "photo", splitMass: 150, childModes: [7, 8], childTurns: [0, 0], color: "#7cc043" }),
      // 7 Seed maker: keeps dropping seeds that drift off and sink.
      mode({
        cellType: "photo",
        splitMass: 200,
        childModes: [0, 7],
        makeBond: false,
        childKeepsBonds: [false, true],
        color: "#a6d65a",
      }),
      // 8 Trunk and leaves: collect light and pass it on, never divide.
      mode({ cellType: "photo", canSplit: false, color: "#5d9a30" }),
      // 9 Root: holds the tree to the bottom.
      mode({ cellType: "root", canSplit: false, color: "#96693c" }),
    ],
  },

  /** Floating algae: pairs of light collectors that keep budding. */
  alge: {
    version: GENOME_VERSION,
    name: "Alge",
    startMode: 0,
    modes: [
      mode({ cellType: "photo", childModes: [1, 1], color: "#9bd14a" }),
      mode({
        cellType: "photo",
        childModes: [1, 0],
        makeBond: false,
        childKeepsBonds: [true, false],
        color: "#b7e05a",
      }),
    ],
  },

  /** Herbivore: grazes on light collectors. */
  beiter: swimmingAnimal("Beiter", "grazer", "#eba03c"),

  /** Carnivore: hunts other animals. */
  jeger: swimmingAnimal("Jeger", "hunter", "#dc4b46"),

  /** Scavengers: a clump of 8 that eats dead matter, mostly on the bottom. */
  klump: DEFAULT_GENOME,

  /** Scavenger with a swimmer, so it can go looking for dead matter. */
  svommer: swimmingAnimal("Svømmer", "eater", "#6ecdaa"),

  /** Decomposers: a mat on the bottom that turns sludge back into nutrients. */
  nedbryter: {
    version: GENOME_VERSION,
    name: "Nedbryter",
    startMode: 0,
    modes: [
      mode({ cellType: "decomposer", childModes: [1, 1], color: "#9673c8" }),
      mode({
        cellType: "decomposer",
        childModes: [1, 0],
        makeBond: false,
        childKeepsBonds: [true, false],
        color: "#9673c8",
      }),
    ],
  },

  /** Scavenger with two light collectors that feed it. */
  blanding: {
    version: GENOME_VERSION,
    name: "Blanding",
    startMode: 0,
    modes: [
      mode({ childModes: [1, 2] }),
      mode({ childModes: [1, 0], makeBond: false, childKeepsBonds: [true, false] }),
      mode({ cellType: "photo", childModes: [3, 3], color: "#9bd14a" }),
      mode({ cellType: "photo", canSplit: false, color: "#b7e05a" }),
    ],
  },
} satisfies Record<string, Genome>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function isPresetId(v: unknown): v is PresetId {
  return typeof v === "string" && v in PRESETS;
}

/**
 * What a fresh glass starts with: one or more species. The ecosystem has
 * every role in the cycle; the others show one organism on its own.
 */
export interface Scene {
  name: string;
  genomes: Genome[];
  /** When each species arrives, in seconds. Missing = at the start. */
  arrivals?: number[];
}

export const SCENES = {
  okosystem: {
    name: "Økosystem",
    // Plants and the clean-up crew first; grazers once there is something to
    // graze; hunters once there is something to hunt.
    genomes: [PRESETS.tre, PRESETS.nedbryter, PRESETS.klump, PRESETS.beiter, PRESETS.jeger],
    arrivals: [0, 0, 0, 300, 600],
  },
  ...(Object.fromEntries(PRESET_IDS.map((id) => [id, { name: PRESETS[id].name, genomes: [PRESETS[id]] }])) as Record<
    PresetId,
    Scene
  >),
} satisfies Record<string, Scene>;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
export const DEFAULT_SCENE: SceneId = "okosystem";

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === "string" && v in SCENES;
}
