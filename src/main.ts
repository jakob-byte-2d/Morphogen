import {
  applyTool,
  createWorld,
  H,
  LIFE_EVERY,
  LIFE_PER_DAY,
  PLANTS,
  SCALE,
  skip,
  stepWorld,
  TICKS_PER_SECOND,
  type Animal,
  type Tool,
  W,
  waterLine,
  type World,
} from "./sim";
import { CreatureCard } from "./ui/card";
import { DevPanel, type DevState } from "./ui/dev";
import { plantIcon } from "./ui/icons";
import { attachInput } from "./ui/input";
import { Menu } from "./ui/menu";
import { Picker } from "./ui/picker";
import { loadSettings, saveSettings } from "./ui/settings";
import { forgetGlass, restoreGlass, storeGlass } from "./ui/storage";
import { t } from "./ui/strings";
import { Toolbar } from "./ui/toolbar";
import "./ui/style.css";
import { Camera } from "./view/camera";
import { darken, lighten } from "./view/palette";
import { Renderer } from "./view/renderer";

const APP_VERSION = "2.0";

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Math.random() * 1e9) | 0;
const settings = loadSettings();
if (params.has("dev")) settings.devMode = true;

/** Time passes while the app is closed: up to three months are made up for. */
const MAX_CATCH_UP = 90 * 24 * 3600 * TICKS_PER_SECOND;
const ticksFor = (ms: number) => (settings.timeAway ? Math.max(0, Math.min(MAX_CATCH_UP, Math.floor((ms / 1000) * TICKS_PER_SECOND))) : 0);

// The glass from last time, if there is one (?seed=… or ?fresh starts a new one).
let world: World;
let catchUp = { left: 0, total: 0 };
const saved = params.has("seed") || params.has("fresh") ? null : restoreGlass();
if (saved) {
  world = saved.world;
  const n = ticksFor(Date.now() - saved.savedAt);
  catchUp = { left: n, total: n };
} else {
  // A new glass has soil and water, and nothing living.
  world = createWorld(seed);
}

let discarding = false;
function keep(): void {
  if (!discarding) storeGlass(world);
}

const app = document.getElementById("app")!;
const glass = document.createElement("div");
glass.className = "glass";
glass.setAttribute("role", "img");
glass.setAttribute("aria-label", t.glass);
app.append(glass);

const camera = new Camera();
const renderer = new Renderer(glass, camera);
const ring = document.createElement("div");
ring.className = "ring";
const catchUpLabel = document.createElement("div");
catchUpLabel.className = "catchup";
catchUpLabel.setAttribute("aria-live", "polite");
glass.append(ring, catchUpLabel);

/** Tools on the bar, in the order they appear. The magnifying glass only looks. */
type BarTool = Tool | "look";
const TOOLS: BarTool[] = ["water", "soil", "seed", "creature", "spade", "look"];
let tool: BarTool = "water";
let plantSpecies = 1;
const light = (c: string) => lighten(c, 0.25);
const dark = (c: string) => darken(c, 0.2);

const seedPicker = new Picker(t.seeds, (k) => (plantSpecies = k));
seedPicker.setItems(
  PLANTS.map((sp) => ({ label: sp.name, icon: plantIcon(sp.form, sp.colors, light, dark) })),
  plantSpecies,
);

const toolbar = new Toolbar(TOOLS, tool, (id, again) => {
  tool = id as BarTool;
  if (tool !== "look") card.hide();
  const wasOpen = seedPicker.open;
  seedPicker.close();
  // Choosing seeds opens their row; tapping the tool again closes it.
  if (tool === "seed" && !(again && wasOpen)) seedPicker.openAt(toolbar.centerOf(tool), toolbar.el.offsetHeight + 4);
});

/** The magnifying glass's card, and how close to an animal a tap must be (in cells) to find it. */
const card = new CreatureCard(light, dark, () => card.hide());
const PICK_REACH = 8 * SCALE;
function pick(x: number, y: number): void {
  let best: Animal | null = null;
  let bestD = PICK_REACH * PICK_REACH;
  for (const a of world.animals) {
    const s = renderer.shownAt(a);
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  if (best) card.show(best, world);
  else card.hide();
}
let cardDrawn = 0;

app.append(toolbar.el, seedPicker.el, card.el);

const dev: DevState = { speed: 1, max: false, paused: false, stepOnce: false, skipDays: 0 };
const devPanel = new DevPanel(dev);
app.append(devPanel.el);
function showDev(): void {
  devPanel.el.hidden = !settings.devMode;
  if (!settings.devMode) {
    Object.assign(dev, { speed: 1, max: false, paused: false });
    devPanel.refresh();
  }
}
showDev();

const menu = new Menu(app, {
  settings,
  settingsChanged: () => saveSettings(settings),
  snapshot: () => renderer.snapshot(),
  newGlass() {
    discarding = true;
    forgetGlass();
    location.replace(location.pathname + (params.has("dev") ? "?dev" : ""));
  },
  toggleDev() {
    settings.devMode = !settings.devMode;
    saveSettings(settings);
    showDev();
  },
  version: APP_VERSION,
});

/** The glass keeps the world's shape and fills the space between the menu and the tools. */
function layout(): void {
  const css = getComputedStyle(document.documentElement);
  const safeTop = parseFloat(css.getPropertyValue("--safe-top")) || 0;
  const pad = 8;
  const top = safeTop + Math.min(56, Math.max(pad, innerHeight - toolbar.el.offsetHeight - 2 * pad - ((innerWidth - 2 * pad) * H) / W));
  const availW = innerWidth - 2 * pad;
  const availH = innerHeight - toolbar.el.offsetHeight - top - pad;
  let gw = availW;
  let gh = (gw * H) / W;
  if (gh > availH) {
    gh = availH;
    gw = (gh * W) / H;
  }
  glass.style.width = `${gw}px`;
  glass.style.height = `${gh}px`;
  glass.style.left = `${(innerWidth - gw) / 2}px`;
  glass.style.top = `${top + (availH - gh)}px`;
  camera.setSize(gw, gh);
}
addEventListener("resize", layout);
layout();

// One finger on the glass uses the tool about ten times a second, in real time.
let stroke: { x: number; y: number } | null = null;
let toolTimer = 0;
attachInput(
  glass,
  camera,
  {
    start(x, y) {
      seedPicker.close();
      if (menu.isOpen) menu.close();
      if (settings.vibration && navigator.vibrate) navigator.vibrate(8);
      if (tool === "look") {
        pick(x, y);
        return;
      }
      // A skrukketroll is let go once per tap; the other tools keep going while held.
      stroke = tool === "creature" ? null : { x, y };
      toolTimer = 0;
      applyTool(world, tool, x, y, plantSpecies);
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
    const size = camera.scale * (tool === "spade" ? 9 : 5);
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
let lastDraw = 0;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  camera.update(dt);

  if (stroke) {
    toolTimer += dt;
    while (toolTimer >= 0.1 && tool !== "look") {
      toolTimer -= 0.1;
      applyTool(world, tool, stroke.x, stroke.y, plantSpecies);
    }
  }

  if (dev.skipDays > 0) {
    const n = dev.skipDays * LIFE_PER_DAY * LIFE_EVERY;
    catchUp = { left: catchUp.left + n, total: catchUp.left + n };
    dev.skipDays = 0;
  }

  const t0 = performance.now();
  if (catchUp.left > 0) {
    // Making up for the time the app was closed, a day at a time per frame.
    const n = Math.min(catchUp.left, LIFE_PER_DAY * LIFE_EVERY);
    skip(world, n);
    catchUp.left -= n;
    catchUpLabel.textContent = t.catchUp(Math.round(100 * (1 - catchUp.left / catchUp.total)));
    catchUpLabel.classList.toggle("on", catchUp.left > 0);
    if (catchUp.left === 0) keep();
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
      acc += dt * TICKS_PER_SECOND * (settings.devMode ? dev.speed : 1);
      let n = 0;
      while (acc >= 1 && n < 2000) {
        stepWorld(world);
        acc -= 1;
        n++;
        ticks++;
      }
      if (n >= 2000) acc = 0;
    }
  }
  stepMs += performance.now() - t0;

  // The animal under the magnifying glass: a ring follows it, and its card is kept up to date.
  renderer.selected = card.animal && card.alive(world) ? card.animal.id : 0;
  if (card.animal && now - cardDrawn > 250) {
    card.update(world);
    cardDrawn = now;
  }

  if (catchUp.left === 0 || now - lastDraw > 250) {
    renderer.draw(world, now / 1000, dt);
    lastDraw = now;
  }

  frames++;
  if (settings.devMode && now - statTime > 500) {
    const secs = (now - statTime) / 1000;
    devPanel.setInfo(world.tick, Math.round(frames / secs), ticks ? stepMs / ticks : 0, Math.round(ticks / secs));
    devPanel.setCounts(world.plants.length, world.seeds.length, world.animals.length, waterLine(world));
    frames = 0;
    ticks = 0;
    stepMs = 0;
    statTime = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keep the glass: now and then, and whenever the app goes to the background.
setInterval(keep, 10000);
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    keep();
  } else if (hiddenAt > 0) {
    const n = ticksFor(Date.now() - hiddenAt);
    catchUp = { left: catchUp.left + n, total: catchUp.left + n };
    last = performance.now();
  }
});
addEventListener("pagehide", keep);

// Works offline once it has been opened, and can be added to the home screen.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
