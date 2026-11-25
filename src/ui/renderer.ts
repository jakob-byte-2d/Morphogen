import { radiusOf, type World } from "../engine";
import { TWO_PI } from "../engine/fmath";

const COLORS = {
  background: "#0b1416",
  dishCenter: "#14292d",
  dishEdge: "#0e1d20",
  dishRim: "rgba(190, 230, 225, 0.28)",
  food: "#d4ec9a",
  cellFill: "rgba(110, 205, 170, 0.55)",
  cellFillRipe: "rgba(170, 230, 150, 0.7)",
  cellStroke: "#a6ead0",
  nucleus: "rgba(20, 60, 50, 0.75)",
  bond: "rgba(225, 250, 238, 0.6)",
};

/** Draws the world onto a canvas. Reads the world, never changes it. */
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

  // World units -> screen pixels, dish centred and fitted to the canvas.
  const R = world.env.dishRadius;
  const scale = (Math.min(width, height) / 2 - 8) / R;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);

  // Dish.
  const grad = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  grad.addColorStop(0, COLORS.dishCenter);
  grad.addColorStop(1, COLORS.dishEdge);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TWO_PI);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3 / scale;
  ctx.strokeStyle = COLORS.dishRim;
  ctx.stroke();

  // Food: one path for all particles.
  const foodRadius = Math.max(1.4, 1.2 / scale);
  ctx.beginPath();
  for (const f of world.food) {
    ctx.moveTo(f.x + foodRadius, f.y);
    ctx.arc(f.x, f.y, foodRadius, 0, TWO_PI);
  }
  ctx.fillStyle = COLORS.food;
  ctx.fill();

  // Cells: bodies, then membranes, then nuclei.
  const ripeMass = world.env.splitMass * 0.8;
  for (const ripe of [false, true]) {
    ctx.beginPath();
    for (const c of world.cells) {
      if (c.mass >= ripeMass !== ripe) continue;
      const r = radiusOf(c.mass);
      ctx.moveTo(c.x + r, c.y);
      ctx.arc(c.x, c.y, r, 0, TWO_PI);
    }
    ctx.fillStyle = ripe ? COLORS.cellFillRipe : COLORS.cellFill;
    ctx.fill();
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
