import { mode, normalizeGenome, type Genome, type Mode } from "../engine";

/**
 * Pure editing operations on a genome. Each returns a new, normalised genome
 * and never changes the one passed in.
 */

/** Adds a new mode at the end: a cell that does not divide, so nothing breaks. */
export function addMode(g: Genome): Genome {
  return normalizeGenome({ ...g, modes: [...g.modes, mode({ canSplit: false })] });
}

/**
 * Removes a mode and fixes every reference to it: references to later modes
 * shift down by one, references to the removed mode point to mode 0.
 */
export function removeMode(g: Genome, index: number): Genome {
  if (g.modes.length <= 1 || index < 0 || index >= g.modes.length) return g;
  const remap = (ref: number): number => (ref === index ? 0 : ref > index ? ref - 1 : ref);
  const modes = g.modes
    .filter((_, i) => i !== index)
    .map((m) => ({ ...m, childModes: [remap(m.childModes[0]), remap(m.childModes[1])] as [number, number] }));
  return normalizeGenome({ ...g, startMode: remap(g.startMode), modes });
}

export function updateMode(g: Genome, index: number, patch: Partial<Mode>): Genome {
  return normalizeGenome({
    ...g,
    modes: g.modes.map((m, i) => (i === index ? { ...m, ...patch } : m)),
  });
}

export function setName(g: Genome, name: string): Genome {
  return normalizeGenome({ ...g, name });
}

export function setStartMode(g: Genome, startMode: number): Genome {
  return normalizeGenome({ ...g, startMode });
}
