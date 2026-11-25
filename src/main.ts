import { applyTool, createWorld, H, stepWorld, stepWorldN, TICKS_PER_SECOND, type Tool, W, type World } from "./sim";
import { DevPanel, type DevState } from "./ui/dev";
import { creatureIcon, plantIcon } from "./ui/icons";
import { Picker } from "./ui/picker";
import { restoreGlass, storeGlass } from "./ui/storage";
import { attachInput } from "./ui/input";
import { t } from "./ui/strings";
import { Toolbar } from "./ui/toolbar";
import "./ui/style.css";
import { Camera } from "./view/camera";
import { darken, lighten } from "./view/palette";
import { Renderer } from "./view/renderer";

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Math.random() * 1e9) | 0;

/** Time passes while the app is closed, but at most an hour is made up for. */
const MAX_CATCH_UP = 3600 * TICKS_PER_SECOND;
const ticksFor = (ms: number) => Math.max(0, Math.min(MAX_CATCH_UP, Math.floor((ms / 1000) * TICKS_PER_SECOND)));

// The glass from last time, if there is one (?seed=… or ?fresh starts a new one).
let world: World;
let catchUp = { left: 0, total: 0 };
const saved = params.has("seed") || params.has("fresh") ? null : restoreGlass();
if (saved) {
  world = saved.world;
  const n = ticksFor(Date.now() - saved.savedAt);
  catchUp = { left: n, total: n };
} else {
  world = createWorld(seed);
  // A new glass is already a couple of minutes old: seeds have sprouted.
  stepWorldN(world, 2 * 60 * TICKS_PER_SECOND);
}

const app = document.getElementById("app")!;
const glass = document.createElement("div");
glass.className = "glass";
glass.setAttribute("role", "img");
glass.setAttribute("aria-label", t.glass);
const ring = document.createElement("div");
ring.className = "ring";
glass.append(ring);
app.append(glass);

const catchUpLabel = document.createElement("div");
catchUpLabel.className = "catchup";
catchUpLabel.setAttribute("aria-live", "polite");
glass.append(catchUpLabel);

const camera = new Camera();
const renderer = new Renderer(glass, camera);
glass.append(ring);

/** Tools on the bar, in the order they appear. */
const TOOLS: Tool[] = ["water", "soil", "seed", "creature", "feed", "spade"];
let tool: Tool = "water";
let plantSpecies = 1;
let creatureSpecies = 0;
const light = (c: string) => lighten(c, 0.25);
const dark = (c: string) => darken(c, 0.2);

const seedPicker = new Picker(t.seeds, (k) => (plantSpecies = k));
seedPicker.setItems(
  world.plantSpecies.map((sp) => ({ label: sp.name, icon: plantIcon(sp.form, sp.colors, light, dark) })),
  plantSpecies,
);
const creaturePicker = new Picker(t.creatures, (k) => (creatureSpecies = k));
creaturePicker.setItems(
  world.creatureSpecies.map((sp) => ({ label: sp.name, icon: creatureIcon(sp.diet, sp.color, light, dark) })),
  creatureSpecies,
);
/** Tools that come with a row for choosing what to use. */
const pickers: Partial<Record<Tool, Picker>> = { seed: seedPicker, creature: creaturePicker };
const closePickers = () => Object.values(pickers).forEach((p) => p.close());

const toolbar = new Toolbar(TOOLS, tool, (id, again) => {
  tool = id as Tool;
  const picker = pickers[tool];
  const wasOpen = picker?.open ?? false;
  closePickers();
  // Choosing seeds or creatures opens their row; tapping the tool again closes it.
  if (picker && !(again && wasOpen)) picker.openAt(toolbar.centerOf(tool), toolbar.el.offsetHeight + 4);
});
app.append(toolbar.el, seedPicker.el, creaturePicker.el);

/** What the tool uses: the chosen seed or creature. */
const choice = () => (tool === "creature" ? creatureSpecies : plantSpecies);

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
      closePickers();
      // A creature is let go once per tap; the other tools keep going while held.
      stroke = tool === "creature" ? null : { x, y };
      toolTimer = 0;
      applyTool(world, tool, x, y, choice());
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
      applyTool(world, tool, stroke.x, stroke.y, choice());
    }
  }

  const t0 = performance.now();
  if (catchUp.left > 0) {
    // Making up for the time the app was closed, as fast as the phone allows.
    do {
      stepWorld(world);
      catchUp.left--;
    } while (catchUp.left > 0 && performance.now() - t0 < 14);
    catchUpLabel.textContent = t.catchUp(Math.round(100 * (1 - catchUp.left / catchUp.total)));
    catchUpLabel.classList.toggle("on", catchUp.left > 0);
    if (catchUp.left === 0) storeGlass(world);
  } else if (dev.stepOnce) {
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

// Keep the glass: now and then, and whenever the app goes to the background.
setInterval(() => storeGlass(world), 10000);
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    storeGlass(world);
  } else if (hiddenAt > 0) {
    const n = ticksFor(Date.now() - hiddenAt);
    catchUp = { left: catchUp.left + n, total: catchUp.left + n };
    last = performance.now();
  }
});
addEventListener("pagehide", () => storeGlass(world));

// Works offline once it has been opened, and can be added to the home screen.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
