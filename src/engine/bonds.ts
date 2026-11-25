import { sqrt } from "./fmath";
import { radiusOf, type Bond, type World } from "./model";

/**
 * Bonds (adhesion) between cells: they keep organisms together and let
 * bonded cells share food. Bonds refer to cells by id, because the cell list
 * is rebuilt whenever cells divide or die.
 */

/** A cell keeps a bond on both daughters if the bonded neighbour lies this close to the division plane (|cos| below this). */
const SHARE_BOTH_THRESHOLD = 0.4;

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
 * Stretched bonds pull their cells together; overstretched bonds break.
 * Compression is left to the normal collision push. Requires indexCells().
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
    if (d > rest * env.bondBreakStretch) {
      broken ??= new Uint8Array(w.bonds.length);
      broken[i] = 1;
      continue;
    }
    if (d <= rest) continue;
    const pull = (d - rest) * env.bondStiffness;
    const nx = dx / d;
    const ny = dy / d;
    const total = a.mass + b.mass;
    const pa = pull * (b.mass / total);
    const pb = pull * (a.mass / total);
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
 * A daughter whose mode says not to keep bonds gets none. Bonds to dead
 * cells disappear. Daughters bond to each other if the mode says so.
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
  const add = (a: number, b: number): void => {
    const da = degree.get(a) ?? 0;
    const db = degree.get(b) ?? 0;
    if (da >= env.maxBondsPerCell || db >= env.maxBondsPerCell) return;
    degree.set(a, da + 1);
    degree.set(b, db + 1);
    out.push({ a, b });
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
    const result: number[] = [];
    if (div.keepFirst && along >= -SHARE_BOTH_THRESHOLD) result.push(div.first);
    if (div.keepSecond && along <= SHARE_BOTH_THRESHOLD) result.push(div.second);
    return result;
  };

  for (const bond of w.bonds) {
    const pa = positionOf(bond.a);
    const pb = positionOf(bond.b);
    if (!pa || !pb) continue; // One side died.
    for (const a of heirs(bond.a, pb.x, pb.y)) {
      for (const b of heirs(bond.b, pa.x, pa.y)) add(a, b);
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
