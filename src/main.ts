import { applyTool, createWorld, H, stepWorld, TICKS_PER_SECOND, type Tool, W } from "./sim";
import { DevPanel, type DevState } from "./ui/dev";
import { attachInput } from "./ui/input";
import { t } from "./ui/strings";
import { Toolbar } from "./ui/toolbar";
import "./ui/style.css";
import { Camera } from "./view/camera";
import { Renderer } from "./view/renderer";

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Math.random() * 1e9) | 0;
const world = createWorld(seed);

const app = document.getElementById("app")!;
const glass = document.createElement("div");
glass.className = "glass";
glass.setAttribute("role", "img");
glass.setAttribute("aria-label", t.glass);
const ring = document.createElement("div");
ring.className = "ring";
glass.append(ring);
app.append(glass);

const camera = new Camera();
const renderer = new Renderer(glass, camera);
glass.append(ring);

/** Tools on the bar. Seeds, creatures and feed join in later steps. */
const TOOLS: Tool[] = ["water", "soil", "spade"];
let tool: Tool = "water";
const toolbar = new Toolbar(TOOLS, tool, (id) => (tool = id as Tool));
app.append(toolbar.el);

const dev: DevState = { speed: 1, max: false, paused: false, stepOnce: false };
let devPanel: DevPanel | null = null;
if (params.has("dev")) {
  devPanel = new DevPanel(dev);
  app.append(devPanel.el);
}

/** The glass keeps the world's shape and fills the space above the tools. */
function layout(): void {
  const css = getComputedStyle(document.documentElement);
  const safeTop = parseFloat(css.getPropertyValue("--safe-top")) || 0;
  const pad = 8;
  const availW = innerWidth - 2 * pad;
  const availH = innerHeight - toolbar.el.offsetHeight - safeTop - 2 * pad;
  let gw = availW;
  let gh = (gw * H) / W;
  if (gh > availH) {
    gh = availH;
    gw = (gh * W) / H;
  }
  glass.style.width = `${gw}px`;
  glass.style.height = `${gh}px`;
  glass.style.left = `${(innerWidth - gw) / 2}px`;
  // Any spare height goes above the glass, so the tools sit right below it.
  glass.style.top = `${safeTop + pad + (availH - gh)}px`;
  camera.setSize(gw, gh);
}
addEventListener("resize", layout);
layout();

// One finger on the glass uses the tool about ten times a second, in real
// time, whatever speed the simulation runs at.
let stroke: { x: number; y: number } | null = null;
let toolTimer = 0;
attachInput(
  glass,
  camera,
  {
    start(x, y) {
      stroke = { x, y };
      toolTimer = 0;
      applyTool(world, tool, x, y);
    },
    move(x, y) {
      if (stroke) {
        stroke.x = x;
        stroke.y = y;
      }
    },
    end() {
      stroke = null;
    },
  },
  (x, y, on) => {
    ring.style.display = on ? "block" : "none";
    if (!on) return;
    const size = camera.scale * (tool === "spade" ? 5 : 3);
    ring.style.width = ring.style.height = `${size}px`;
    ring.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
  },
);

let last = performance.now();
let acc = 0;
let frames = 0;
let ticks = 0;
let stepMs = 0;
let statTime = last;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  camera.update(dt);

  if (stroke) {
    toolTimer += dt;
    while (toolTimer >= 0.1) {
      toolTimer -= 0.1;
      applyTool(world, tool, stroke.x, stroke.y);
    }
  }

  const t0 = performance.now();
  if (dev.stepOnce) {
    dev.stepOnce = false;
    stepWorld(world);
    ticks++;
  } else if (!dev.paused) {
    if (dev.max) {
      do {
        stepWorld(world);
        ticks++;
      } while (performance.now() - t0 < 12);
    } else {
      acc += dt * TICKS_PER_SECOND * dev.speed;
      let n = 0;
      while (acc >= 1 && n < 400) {
        stepWorld(world);
        acc -= 1;
        n++;
        ticks++;
      }
      if (n >= 400) acc = 0;
    }
  }
  stepMs += performance.now() - t0;

  renderer.draw(world, now / 1000, dt);

  frames++;
  if (devPanel && now - statTime > 500) {
    const secs = (now - statTime) / 1000;
    devPanel.setInfo(world.tick, Math.round(frames / secs), ticks ? stepMs / ticks : 0, Math.round(ticks / secs));
    frames = 0;
    ticks = 0;
    stepMs = 0;
    statTime = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
