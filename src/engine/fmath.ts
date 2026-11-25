/**
 * Deterministic math for the simulation.
 *
 * Math.sin, Math.cos, Math.exp, Math.pow, Math.atan2 etc. are only
 * "implementation-approximated" in JavaScript: different browsers may return
 * slightly different results, and in a simulation those tiny differences grow
 * until two phones disagree about who won a match.
 *
 * + - * / are exact IEEE-754 operations and give the same answer everywhere,
 * as do Math.floor/round/abs/min/max. Math.sqrt is correctly rounded in every
 * engine in practice. Everything in here is built from those.
 */

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

// Taylor coefficients for sin on [-PI/2, PI/2]. Max error is about 6e-12.
const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const S15 = -1 / 1307674368000;

export function sin(x: number): number {
  // Reduce to [-PI, PI].
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  // Reduce to [-PI/2, PI/2] using sin(PI - r) = sin(r).
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return (
    r *
    (1 + r2 * (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * (S13 + r2 * S15)))))))
  );
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}

export const sqrt = Math.sqrt;

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}
