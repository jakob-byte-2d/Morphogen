/**
 * The fingerprint of a known glass after a fixed number of steps. If a change
 * alters it without meaning to change the rules, it is a bug.
 */
export const GOLDEN: { simVersion: number; seed: number; ticks: number; hash: string } = {
  simVersion: 11,
  seed: 42,
  ticks: 3000,
  hash: "48d93a31",
};
