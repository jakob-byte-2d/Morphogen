import { DEFAULT_GENOME, GENOME_VERSION, mode, type Genome } from "../engine";

/**
 * Ready-made organisms to play with until the genome editor arrives (phase 3).
 * Each mode is a recipe; comments describe what the cell does.
 */
export const PRESETS = {
  klump: DEFAULT_GENOME,

  alge: {
    version: GENOME_VERSION,
    name: "Alge",
    startMode: 0,
    modes: [
      // Light collector that divides into a bonded pair.
      mode({ cellType: "photo", childModes: [1, 1], color: "#9bd14a" }),
      // Each cell in the pair keeps budding off single cells that start new pairs.
      mode({
        cellType: "photo",
        childModes: [1, 0],
        makeBond: false,
        childKeepsBonds: [true, false],
        color: "#b7e05a",
      }),
    ],
  },

  blanding: {
    version: GENOME_VERSION,
    name: "Blanding",
    startMode: 0,
    modes: [
      // Founder eater divides into an eater and a light collector.
      mode({ childModes: [1, 2] }),
      // The eater keeps budding off new founders; the light collectors feed it.
      mode({ childModes: [1, 0], makeBond: false, childKeepsBonds: [true, false] }),
      // The light collector divides once...
      mode({ cellType: "photo", childModes: [3, 3], color: "#9bd14a" }),
      // ...and then just collects light.
      mode({ cellType: "photo", canSplit: false, color: "#b7e05a" }),
    ],
  },

  svommer: {
    version: GENOME_VERSION,
    name: "Svømmer",
    startMode: 0,
    modes: [
      // Founder eater divides into an eater (front) and a swimmer (back),
      // both facing forward, so the swimmer pushes the eater towards food.
      mode({ childModes: [1, 2], childTurns: [0, 0] }),
      // The eater keeps budding off new founders.
      mode({ childModes: [1, 0], makeBond: false, childKeepsBonds: [true, false] }),
      // The swimmer never divides, it just swims.
      mode({ cellType: "swim", canSplit: false, color: "#5a96dc" }),
    ],
  },
} satisfies Record<string, Genome>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
export const DEFAULT_PRESET: PresetId = "klump";

export function isPresetId(v: unknown): v is PresetId {
  return typeof v === "string" && v in PRESETS;
}
