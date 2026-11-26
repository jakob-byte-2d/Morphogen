/**
 * The fingerprint of a known glass, sown as the tests sow it (tests/helpers),
 * after a fixed number of life steps (the quick way, with skrukketroll let
 * in halfway), then fast steps. If a change
 * alters it without meaning to change the rules, it is a bug.
 */
export const GOLDEN: { simVersion: number; seed: number; life: number; ticks: number; hash: string } = {
  simVersion: 17,
  seed: 42,
  life: 1500,
  ticks: 600,
  hash: "20e0233a",
};
