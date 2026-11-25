import { PI, atan2, cos, sin, sqrt, wrapAngle } from "./fmath";
import { radiusOf, type Bond, type Cell, type World } from "./model";

/**
 * Bonds (adhesion) between cells: they keep organisms together and let
 * bonded cells share food. Bonds refer to cells by id, because the cell list
 * is rebuilt whenever cells divide or die.
 */

/** A cell keeps a bond on both daughters if the bonded neighbour lies this close to the division plane (|cos| below this). */
const SHARE_BOTH_THRESHOLD = 0.4;

/** Creates a bond between two cells, attached where they touch right now. */
export function makeBond(a: Cell, b: Cell): Bond {
  const dir = atan2(b.y - a.y, b.x - a.x);
  return {
    a: a.id,
    b: b.id,
    angA: wrapAngle(dir - a.angle),
    angB: wrapAngle(dir + PI - b.angle),
  };
}

/**
 * Turns bonded cells so they keep facing the same way relative to their
 * neighbours. When an organism rotates, its cells rotate with it, so split
 * angles and swimmers stay pointed the right way. Requires indexCells().
 */
export function alignOrientations(w: World): void {
  const rate = w.env.alignRate;
  if (rate <= 0 || w.bonds.length === 0) return;
  const n = w.cells.length;
  if (w.scratch.turnX.length < n) {
    w.scratch.turnX = new Float64Array(n * 2);
    w.scratch.turnY = new Float64Array(n * 2);
  }
  const { turnX, turnY, indexById: index } = w.scratch;
  turnX.fill(0, 0, n);
  turnY.fill(0, 0, n);

  for (const bond of w.bonds) {
    const ia = index.get(bond.a)!;
    const ib = index.get(bond.b)!;
    const a = w.cells[ia];
    const b = w.cells[ib];
    const dir = atan2(b.y - a.y, b.x - a.x);
    // The orientation each end should have to keep its attachment point facing the other.
    const wantA = dir - bond.angA;
    const wantB = dir + PI - bond.angB;
    turnX[ia] += cos(wantA);
    turnY[ia] += sin(wantA);
    turnX[ib] += cos(wantB);
    turnY[ib] += sin(wantB);
  }

  for (let i = 0; i < n; i++) {
    if (turnX[i] === 0 && turnY[i] === 0) continue;
    const c = w.cells[i];
    const target = atan2(turnY[i], turnX[i]);
    c.angle = wrapAngle(c.angle + wrapAngle(target - c.angle) * rate);
  }
}

/** Rebuilds world.scratch.indexById from the current cell list. */
export function indexCells(w: World): void {
  const index = w.scratch.indexById;
  index.clear();
  for (let i = 0; i < w.cells.length; i++) index.set(w.cells[i].id, i);
}

/** Bonded cells even out their mass a little every tick. Requires indexCells(). */
export function shareNutrients(w: World, dt: number): void {
  // Above 0.5 the flow would overshoot and swap which cell is richer.
  const rate = Math.min(0.5, w.env.nutrientShare * dt);
  if (rate <= 0) return;
  const index = w.scratch.indexById;
  for (const bond of w.bonds) {
    const a = w.cells[index.get(bond.a)!];
    const b = w.cells[index.get(bond.b)!];
    const flow = (a.mass - b.mass) * rate;
    a.mass -= flow;
    b.mass += flow;
  }
}

/**
 * Stretched bonds pull their cells together; overstretched bonds break,
 * except bonds to an anchored root. Compression is left to the normal
 * collision push. Requires indexCells().
 */
export function applyBondForces(w: World): void {
  const { env } = w;
  const index = w.scratch.indexById;
  let broken: Uint8Array | null = null;

  for (let i = 0; i < w.bonds.length; i++) {
    const bond = w.bonds[i];
    const a = w.cells[index.get(bond.a)!];
    const b = w.cells[index.get(bond.b)!];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = sqrt(dx * dx + dy * dy);
    const rest = (radiusOf(a.mass) + radiusOf(b.mass)) * env.bondRestFactor;
    // A bond to an anchored cell (a root) never breaks: roots hold.
    const holds = a.anchored || b.anchored;
    if (d > rest * env.bondBreakStretch && !holds) {
      broken ??= new Uint8Array(w.bonds.length);
      broken[i] = 1;
      continue;
    }
    if (d <= rest) continue;
    const pull = (d - rest) * env.bondStiffness;
    const nx = dx / d;
    const ny = dy / d;
    // An anchored cell does not budge, so the other cell takes the whole pull.
    const total = a.mass + b.mass;
    const pa = a.anchored ? 0 : b.anchored ? pull : pull * (b.mass / total);
    const pb = b.anchored ? 0 : a.anchored ? pull : pull * (a.mass / total);
    a.vx += nx * pa;
    a.vy += ny * pa;
    b.vx -= nx * pb;
    b.vy -= ny * pb;
  }

  if (broken) {
    const keep = broken;
    w.bonds = w.bonds.filter((_, i) => keep[i] === 0);
  }
}

/**
 * Hands bonds over after this tick's divisions and deaths.
 *
 * Call after world.cells has been replaced and indexCells() has run on the new
 * list, with scratch.divisions filled. A bond to a parent goes to the daughter
 * on the neighbour's side; if the neighbour lies near the division plane,
 * both daughters keep it, which makes organisms stiff instead of floppy.
 * A daughter whose mode says not to keep bonds gets none, and its sister
 * takes them all instead. Bonds to dead cells disappear. Daughters bond to
 * each other if the mode says so.
 */
export function rebuildBonds(w: World, anyDeaths: boolean): void {
  const { env } = w;
  const index = w.scratch.indexById;
  const divisions = w.scratch.divisions;
  // Nothing divided or died: every bond is still valid.
  if (!anyDeaths && divisions.size === 0) return;

  const degree = w.scratch.bondDegree;
  degree.clear();
  const out: Bond[] = [];
  const add = (a: number, b: number, old?: Bond): void => {
    const da = degree.get(a) ?? 0;
    const db = degree.get(b) ?? 0;
    if (da >= env.maxBondsPerCell || db >= env.maxBondsPerCell) return;
    degree.set(a, da + 1);
    degree.set(b, db + 1);
    if (old && old.a === a && old.b === b) {
      out.push(old); // Same two cells: keep the attachment points.
    } else {
      out.push(makeBond(w.cells[index.get(a)!], w.cells[index.get(b)!]));
    }
  };

  // Position of a cell as it was just before any division this tick.
  const positionOf = (id: number): { x: number; y: number } | null => {
    const div = divisions.get(id);
    if (div) return div;
    const i = index.get(id);
    return i === undefined ? null : w.cells[i];
  };

  // Which cell(s) now stand in for `id`, given the neighbour position.
  const heirs = (id: number, nx: number, ny: number): number[] => {
    const div = divisions.get(id);
    if (!div) return index.has(id) ? [id] : [];
    const dx = nx - div.x;
    const dy = ny - div.y;
    const d = sqrt(dx * dx + dy * dy);
    const along = d > 0 ? (dx * div.dirX + dy * div.dirY) / d : 0;
    // If only one daughter keeps bonds, it takes all of them, so a cell that
    // buds stays attached to its organism. If both keep bonds, each takes the
    // neighbours on its own side, and both take those beside the division plane.
    const result: number[] = [];
    const firstSide = along >= -SHARE_BOTH_THRESHOLD;
    const secondSide = along <= SHARE_BOTH_THRESHOLD;
    if (div.keepFirst && (firstSide || !div.keepSecond)) result.push(div.first);
    if (div.keepSecond && (secondSide || !div.keepFirst)) result.push(div.second);
    return result;
  };

  for (const bond of w.bonds) {
    const pa = positionOf(bond.a);
    const pb = positionOf(bond.b);
    if (!pa || !pb) continue; // One side died.
    for (const a of heirs(bond.a, pb.x, pb.y)) {
      for (const b of heirs(bond.b, pa.x, pa.y)) add(a, b, bond);
    }
  }

  // Map iteration follows insertion order, which is cell order: deterministic.
  for (const div of divisions.values()) {
    if (div.makeBond) add(div.first, div.second);
  }

  w.bonds = out;
}

/** Number of organisms: groups of cells connected by bonds (a lone cell counts as one). */
export function countOrganisms(w: World): number {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const c of w.cells) parent.set(c.id, c.id);
  let groups = w.cells.length;
  for (const bond of w.bonds) {
    if (!parent.has(bond.a) || !parent.has(bond.b)) continue;
    const ra = find(bond.a);
    const rb = find(bond.b);
    if (ra !== rb) {
      parent.set(ra, rb);
      groups--;
    }
  }
  return groups;
}
