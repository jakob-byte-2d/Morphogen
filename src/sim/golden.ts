/**
 * The fingerprint of a known glass after a fixed number of life steps (the
 * quick way), then fast steps. If a change
 * alters it without meaning to change the rules, it is a bug.
 */
export const GOLDEN: { simVersion: number; seed: number; life: number; ticks: number; hash: string } = {
  simVersion: 16,
  seed: 42,
  life: 1500,
  ticks: 600,
  hash: "53f14b08",
};
