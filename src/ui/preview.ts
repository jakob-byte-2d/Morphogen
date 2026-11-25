import { DEFAULT_ENVIRONMENT, createWorld, stepWorld, type Environment, type Genome, type World } from "../engine";
import { indexCells } from "../engine/bonds";
import { render } from "./renderer";

/**
 * A small, rich dish where an organism grows quickly, so the player can see
 * the shape their genome makes. Uses the real engine, so what you see is
 * exactly how the organism grows in the game.
 */
const PREVIEW_ENV: Environment = {
  ...DEFAULT_ENVIRONMENT,
  tankWidth: 240,
  tankHeight: 170,
  lightDepth: 215,
  foodPerSecond: 60,
  maxFood: 500,
  metabolism: 0.5,
  swimCost: 0,
  maxCells: 120,
};

/**
 * Keeps only the biggest organism (bonded group) in the preview dish, so
 * cells that bud off do not hide the shape. Only ever used on the preview's
 * own world, never on a game.
 */
function keepLargestOrganism(w: World): void {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    while (parent.get(id) !== id) id = parent.get(id)!;
    return id;
  };
  for (const c of w.cells) parent.set(c.id, c.id);
  for (const b of w.bonds) parent.set(find(b.a), find(b.b));
  const sizes = new Map<number, number>();
  for (const c of w.cells) {
    const root = find(c.id);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  let best = -1;
  let bestSize = 0;
  for (const c of w.cells) {
    const root = find(c.id);
    const size = sizes.get(root)!;
    if (size > bestSize) {
      best = root;
      bestSize = size;
    }
  }
  if (bestSize === w.cells.length) return;
  w.cells = w.cells.filter((c) => find(c.id) === best);
  w.bonds = w.bonds.filter((b) => find(b.a) === best);
  indexCells(w);
}

/** Simulation ticks per animation frame (about 12× real time at 60 fps). */
const TICKS_PER_FRAME = 6;
/** The preview stops after this many ticks (90 seconds of game time). */
const MAX_TICKS = 2700;

export class Preview {
  private world: World | null = null;
  private frame = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onUpdate: (cells: number) => void,
  ) {}

  /** Starts growing a fresh organism from this genome. */
  show(genome: Genome): void {
    this.world = createWorld(1, { env: PREVIEW_ENV, genomes: [genome] });
    if (!this.running) {
      this.running = true;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private tick = (): void => {
    if (!this.running || !this.world) return;
    const w = this.world;
    for (let i = 0; i < TICKS_PER_FRAME && w.tick < MAX_TICKS; i++) {
      stepWorld(w);
      keepLargestOrganism(w);
    }
    render(this.canvas, w);
    this.onUpdate(w.cells.length);
    this.frame = requestAnimationFrame(this.tick);
  };
}
