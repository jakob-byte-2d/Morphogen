/**
 * The fingerprint of a known glass after a fixed number of steps. If a change
 * alters it without meaning to change the rules, it is a bug.
 */
export const GOLDEN: { simVersion: number; seed: number; ticks: number; hash: string } = {
  simVersion: 4,
  seed: 42,
  ticks: 3000,
  hash: "3aa7903e",
};
