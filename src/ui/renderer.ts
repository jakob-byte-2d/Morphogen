import { CELL_TYPES, radiusOf, type CellType, type World } from "../engine";
import { TWO_PI } from "../engine/fmath";

const COLORS = {
  background: "#0b1416",
  glass: "rgba(190, 230, 225, 0.32)",
  glassFill: "rgba(190, 230, 225, 0.04)",
  waterTop: "#1f4f52",
  waterBottom: "#0b1a1e",
  surface: "rgba(200, 240, 235, 0.55)",
  food: "#d4ec9a",
  sludge: "#9a7a48",
  sludgeLayer: "rgba(120, 90, 50, 0.35)",
  cellStroke: "#a6ead0",
  nucleus: "rgba(20, 60, 50, 0.75)",
  bond: "rgba(225, 250, 238, 0.6)",
  tail: "rgba(170, 205, 245, 0.8)",
};

/** Body colour per cell type: [growing, nearly ready to divide]. */
const CELL_FILL: Record<CellType, [string, string]> = {
  eater: ["rgba(110, 205, 170, 0.55)", "rgba(150, 225, 190, 0.75)"],
  photo: ["rgba(120, 190, 60, 0.6)", "rgba(185, 225, 80, 0.8)"],
  swim: ["rgba(90, 150, 220, 0.6)", "rgba(140, 185, 240, 0.8)"],
  root: ["rgba(150, 105, 60, 0.75)", "rgba(185, 135, 80, 0.85)"],
  grazer: ["rgba(235, 160, 60, 0.6)", "rgba(250, 195, 105, 0.8)"],
  hunter: ["rgba(220, 75, 70, 0.6)", "rgba(245, 120, 110, 0.8)"],
  decomposer: ["rgba(150, 115, 200, 0.6)", "rgba(185, 155, 230, 0.8)"],
};

/** Glass thickness and the air gap above the water, in world units. */
const RIM = 6;
const AIR = 16;

/** Draws the glass from the side. Reads the world, never changes it. */
export function render(canvas: HTMLCanvasElement, world: World): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // World units -> screen pixels: the whole glass fitted and centred.
  const W = world.env.tankWidth;
  const H = world.env.tankHeight;
  const outerW = W + 2 * RIM;
  const outerH = H + AIR + RIM;
  const scale = Math.min((width - 16) / outerW, (height - 16) / outerH);
  ctx.translate((width - W * scale) / 2, (height - outerH * scale) / 2 + AIR * scale);
  ctx.scale(scale, scale);

  // Glass.
  ctx.beginPath();
  ctx.roundRect(-RIM, -AIR, W + 2 * RIM, H + AIR + RIM, [4, 4, 14, 14]);
  ctx.fillStyle = COLORS.glassFill;
  ctx.fill();
  ctx.lineWidth = 2 / scale;
  ctx.strokeStyle = COLORS.glass;
  ctx.stroke();

  // Water: lighter near the lamp, darker towards the bottom.
  const water = ctx.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, COLORS.waterTop);
  water.addColorStop(1, COLORS.waterBottom);
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, [0, 0, 10, 10]);
  ctx.fillStyle = water;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = COLORS.surface;
  ctx.stroke();

  // Sludge: food and dead matter that has settled on the bottom.
  const settledY = H - 2;
  let settled = 0;
  for (const f of world.food) if (f.y >= settledY) settled++;
  if (settled > 0) {
    const layer = Math.min(H * 0.1, 2 + settled * 0.06);
    ctx.beginPath();
    ctx.roundRect(0, H - layer, W, layer, [0, 0, 10, 10]);
    ctx.fillStyle = COLORS.sludgeLayer;
    ctx.fill();
  }

  // Particles: one path for floating food, one for sludge.
  const foodRadius = Math.max(1.4, 1.2 / scale);
  for (const onBottom of [false, true]) {
    ctx.beginPath();
    for (const f of world.food) {
      if (f.y >= settledY !== onBottom) continue;
      ctx.moveTo(f.x + foodRadius, f.y);
      ctx.arc(f.x, f.y, foodRadius, 0, TWO_PI);
    }
    ctx.fillStyle = onBottom ? COLORS.sludge : COLORS.food;
    ctx.fill();
  }

  // Cells: bodies (one path per type and ripeness), then membranes, then nuclei.
  const isRipe = (c: World["cells"][number]): boolean => {
    const m = world.genomes[c.species].modes[c.mode];
    return m.canSplit && c.mass >= m.splitMass * 0.8;
  };
  for (const type of CELL_TYPES) {
    for (const ripe of [false, true]) {
      ctx.beginPath();
      for (const c of world.cells) {
        if (c.type !== type || isRipe(c) !== ripe) continue;
        const r = radiusOf(c.mass);
        ctx.moveTo(c.x + r, c.y);
        ctx.arc(c.x, c.y, r, 0, TWO_PI);
      }
      ctx.fillStyle = CELL_FILL[type][ripe ? 1 : 0];
      ctx.fill();
    }
  }

  ctx.beginPath();
  for (const c of world.cells) {
    const r = radiusOf(c.mass);
    ctx.moveTo(c.x + r, c.y);
    ctx.arc(c.x, c.y, r, 0, TWO_PI);
  }
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = COLORS.cellStroke;
  ctx.stroke();

  // Swimmers get a tail (flagellum) behind them, showing which way they push.
  ctx.beginPath();
  for (const c of world.cells) {
    if (c.type !== "swim") continue;
    const r = radiusOf(c.mass);
    const bx = -Math.cos(c.angle);
    const by = -Math.sin(c.angle);
    // Wiggle the tail a little with the cell's age, so it looks alive.
    const wiggle = Math.sin(c.age * 0.6) * 0.35;
    const sx = Math.cos(c.angle + Math.PI / 2) * wiggle * r;
    const sy = Math.sin(c.angle + Math.PI / 2) * wiggle * r;
    ctx.moveTo(c.x + bx * r, c.y + by * r);
    ctx.quadraticCurveTo(c.x + bx * r * 1.5 + sx, c.y + by * r * 1.5 + sy, c.x + bx * r * 2, c.y + by * r * 2);
  }
  ctx.lineWidth = 2 / scale;
  ctx.strokeStyle = COLORS.tail;
  ctx.stroke();

  // Bonds between cells in the same organism.
  const index = world.scratch.indexById;
  ctx.beginPath();
  for (const bond of world.bonds) {
    const ia = index.get(bond.a);
    const ib = index.get(bond.b);
    if (ia === undefined || ib === undefined) continue;
    const a = world.cells[ia];
    const b = world.cells[ib];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.lineWidth = 2.5 / scale;
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.bond;
  ctx.stroke();

  ctx.beginPath();
  for (const c of world.cells) {
    const r = radiusOf(c.mass) * 0.3;
    ctx.moveTo(c.x + r, c.y);
    ctx.arc(c.x, c.y, r, 0, TWO_PI);
  }
  ctx.fillStyle = COLORS.nucleus;
  ctx.fill();
}
