/**
 * The "golden" fingerprint: running the default world with this seed for this
 * many ticks must give exactly this hash, on every device and in every
 * browser. Tests check it, and the performance page (bench.html) shows it so
 * you can compare phones.
 *
 * If you change the simulation rules ON PURPOSE: bump ENGINE_VERSION in
 * world.ts and update the hash here. If the hash changes when you did NOT
 * mean to change the rules, something is broken.
 */
export const GOLDEN: {
  readonly engineVersion: number;
  readonly seed: number;
  readonly ticks: number;
  readonly hash: string;
} = { engineVersion: 4, seed: 42, ticks: 10000, hash: "ee12a73b" };
