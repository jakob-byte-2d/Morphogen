import type { CellType } from "../engine/world";

/**
 * Genome format – planned for phase 2, not used by the engine yet.
 *
 * A genome is a list of modes ("recipes"). Every cell is in exactly one mode.
 * When a cell divides, each daughter gets the mode its parent's recipe says.
 * Genomes are stored and shared as JSON, so keep this format stable and bump
 * GENOME_VERSION when it changes.
 */
export const GENOME_VERSION = 1;

export interface Mode {
  cellType: CellType;
  /** Mass at which the cell divides. */
  splitMass: number;
  /** Division direction relative to the parent, in radians. */
  splitAngle: number;
  /** Modes the two daughter cells get. */
  childModes: [number, number];
  /** Whether the daughters stay stuck together. */
  keepAdhesion: boolean;
  /** Display colour, e.g. "#7fd6b4". */
  color: string;
}

export interface Genome {
  version: number;
  name: string;
  /** Mode of the first cell. */
  startMode: number;
  modes: Mode[];
}
