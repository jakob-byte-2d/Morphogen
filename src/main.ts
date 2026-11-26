import {
  addCreatureSpecies,
  addPlantSpecies,
  applyTool,
  createWorld,
  H,
  LIFE_EVERY,
  LIFE_PER_DAY,
  sleepWorld,
  START_LIFE,
  stepWorld,
  TICKS_PER_SECOND,
  type Tool,
  totalUnits,
  totalWater,
  W,
  type World,
} from "./sim";
import { Creator } from "./ui/creator";
import { DevPanel, type DevState } from "./ui/dev";
import { creatureIcon, plantIcon } from "./ui/icons";
import { attachInput } from "./ui/input";
import { Menu } from "./ui/menu";
import { loadLibrary, saveLibrary } from "./ui/library";
import { Picker } from "./ui/picker";
import { loadSettings, saveSettings } from "./ui/settings";
import { forgetHistory, loadHistory, record, SAMPLE_EVERY, saveHistory } from "./ui/stats";
import { forgetGlass, restoreGlass, storeGlass } from "./ui/storage";
import { t } from "./ui/strings";
import { Toolbar } from "./ui/toolbar";
import "./ui/style.css";
import { Camera } from "./view/camera";
import { darken, lighten } from "./view/palette";
import { Renderer } from "./view/renderer";

const APP_VERSION = "0.11";

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Math.random() * 1e9) | 0;
const settings = loadSettings();
if (params.has("dev")) settings.devMode = true;

/** Time passes while the app is closed: up to three months are made up for. */
const MAX_CATCH_UP = 90 * 24 * 3600 * TICKS_PER_SECOND;
const ticksFor = (ms: number) =>
  settings.timeAway ? Math.max(0, Math.min(MAX_CATCH_UP, Math.floor((ms / 1000) * TICKS_PER_SECOND * settings.speed))) : 0;

// The glass from last time, if there is one (?seed=… or ?fresh starts a new one).
let world: World;
let catchUp = { left: 0, total: 0, starting: false };
const saved = params.has("seed") || params.has("fresh") ? null : restoreGlass();
const history = saved ? loadHistory() : (forgetHistory(), loadHistory());
if (saved) {
  world = saved.world;
  const n = ticksFor(Date.now() - saved.savedAt);
  catchUp = { left: n, total: n, starting: false };
} else {
  world = createWorld(seed);
  // Species the player has made before come along into a new glass.
  const lib = loadLibrary();
  for (const sp of lib.plants) addPlantSpecies(world, sp);
  for (const sp of lib.creatures) addCreatureSpecies(world, sp);
  // A new glass is run on until its plants have grown and its animals are
  // in, before it is ready to be looked after.
  catchUp = { left: START_LIFE * LIFE_EVERY, total: START_LIFE * LIFE_EVERY, starting: true };
}
let nextSample = Math.ceil((world.tick + 1) / SAMPLE_EVERY) * SAMPLE_EVERY;

/** Saves the glass and its history, unless it is being thrown away. */
let discarding = false;
function keep(): void {
  if (discarding) return;
  storeGlass(world);
  saveHistory(history);
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

/** Tools on the bar, in the order they appear. */
const TOOLS: Tool[] = ["water", "soil", "seed", "creature", "feed", "spade"];
let tool: Tool = "water";
let plantSpecies = 1;
let creatureSpecies = 0;
const light = (c: string) => lighten(c, 0.25);
const dark = (c: string) => darken(c, 0.2);

const seedPicker = new Picker(t.seeds, (k) => (plantSpecies = k));
const creaturePicker = new Picker(t.creatures, (k) => (creatureSpecies = k));
const creator = new Creator(light, dark);

/** The last item in each row makes a new species, which joins the row and is chosen. */
function fillPickers(): void {
  seedPicker.setItems(
    world.plantSpecies.map((sp) => ({ label: sp.name, icon: plantIcon(sp.form, sp.colors, light, dark) })),
    plantSpecies,
    {
      label: t.creator.newItem,
      open: () =>
        creator.openPlant(world.plantSpecies.length - 2, (sp) => {
          const k = addPlantSpecies(world, sp);
          if (k < 0) return;
          const lib = loadLibrary();
          lib.plants.push(world.plantSpecies[k]);
          saveLibrary(lib);
          plantSpecies = k;
          fillPickers();
        }),
    },
  );
  creaturePicker.setItems(
    world.creatureSpecies.map((sp) => ({ label: sp.name, icon: creatureIcon(sp.diet, sp.color, light, dark) })),
    creatureSpecies,
    {
      label: t.creator.newItem,
      open: () =>
        creator.openCreature(world.creatureSpecies.length - 2, (sp) => {
          const k = addCreatureSpecies(world, sp);
          if (k < 0) return;
          const lib = loadLibrary();
          lib.creatures.push(world.creatureSpecies[k]);
          saveLibrary(lib);
          creatureSpecies = k;
          fillPickers();
        }),
    },
  );
}
fillPickers();
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
app.append(toolbar.el, seedPicker.el, creaturePicker.el, creator.el);

/** What the tool uses: the chosen seed or creature. */
const choice = () => (tool === "creature" ? creatureSpecies : plantSpecies);

const dev: DevState = { speed: 1, max: false, paused: false, stepOnce: false, skipDays: 0, overlay: "none" };
const devPanel = new DevPanel(dev);
app.append(devPanel.el);
function showDev(): void {
  devPanel.el.hidden = !settings.devMode;
  if (!settings.devMode) {
    Object.assign(dev, { speed: 1, max: false, paused: false, overlay: "none" });
    devPanel.refresh();
  }
}
showDev();

const menu = new Menu(app, {
  world: () => world,
  settings,
  settingsChanged: () => saveSettings(settings),
  history: () => history,
  snapshot: () => renderer.snapshot(),
  newGlass() {
    discarding = true;
    forgetGlass();
    forgetHistory();
    const keepDev = params.has("dev") ? "?dev" : "";
    location.replace(location.pathname + keepDev);
  },
  toggleDev() {
    settings.devMode = !settings.devMode;
    saveSettings(settings);
    showDev();
  },
  version: APP_VERSION,
  light,
  dark,
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
  // Any spare height goes above the glass, so the tools sit right below it.
  glass.style.top = `${top + (availH - gh)}px`;
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
      creator.close();
      if (menu.isOpen) menu.close();
      if (settings.vibration && navigator.vibrate) navigator.vibrate(8);
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

function step(): void {
  stepWorld(world);
  sampleIfDue();
}

/**
 * Catching up: moves the glass on the quick way (see sleepWorld), at most to
 * the next life step at a time. Returns the fast steps it moved on.
 */
function catchUpStep(): number {
  const n = Math.min(catchUp.left, LIFE_EVERY - (world.tick % LIFE_EVERY));
  sleepWorld(world, n);
  sampleIfDue();
  return n;
}

function sampleIfDue(): void {
  if (world.tick < nextSample) return;
  record(history, world);
  nextSample = (Math.floor(world.tick / SAMPLE_EVERY) + 1) * SAMPLE_EVERY;
}

let last = performance.now();
let acc = 0;
let frames = 0;
let ticks = 0;
let stepMs = 0;
let statTime = last;
let lastDraw = 0;
/** While catching up: milliseconds of stepping per frame, and how often the glass is drawn. */
const CATCH_UP_MS = 40;
const CATCH_UP_DRAW_EVERY = 250;

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

  if (dev.skipDays > 0) {
    const n = dev.skipDays * LIFE_PER_DAY * LIFE_EVERY;
    catchUp = { left: catchUp.left + n, total: catchUp.left + n, starting: catchUp.starting };
    dev.skipDays = 0;
  }

  const t0 = performance.now();
  if (catchUp.left > 0) {
    // Making up for the time the app was closed, as fast as the phone allows:
    // most of each frame goes to the glass, which is drawn only now and then.
    do {
      catchUp.left -= catchUpStep();
    } while (catchUp.left > 0 && performance.now() - t0 < CATCH_UP_MS);
    const done = Math.round(100 * (1 - catchUp.left / catchUp.total));
    catchUpLabel.textContent = catchUp.starting ? t.starting(done) : t.catchUp(done);
    catchUpLabel.classList.toggle("on", catchUp.left > 0);
    if (catchUp.left === 0) keep();
  } else if (dev.stepOnce) {
    dev.stepOnce = false;
    step();
    ticks++;
  } else if (!dev.paused) {
    if (dev.max) {
      do {
        step();
        ticks++;
      } while (performance.now() - t0 < 12);
    } else {
      acc += dt * TICKS_PER_SECOND * (settings.devMode ? dev.speed : 1) * settings.speed;
      let n = 0;
      while (acc >= 1 && n < 400) {
        step();
        acc -= 1;
        n++;
        ticks++;
      }
      if (n >= 400) acc = 0;
    }
  }
  stepMs += performance.now() - t0;

  if (catchUp.left === 0 || now - lastDraw > CATCH_UP_DRAW_EVERY) {
    renderer.overlay = dev.overlay;
    renderer.draw(world, now / 1000, dt);
    lastDraw = now;
  }

  frames++;
  if (settings.devMode && now - statTime > 500) {
    const secs = (now - statTime) / 1000;
    devPanel.setInfo(world.tick, Math.round(frames / secs), ticks ? stepMs / ticks : 0, Math.round(ticks / secs));
    devPanel.setCounts(world.plants.length, world.creatures.length, totalUnits(world), Math.round(totalWater(world) / 32));
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
    catchUp = { left: catchUp.left + n, total: catchUp.left + n, starting: catchUp.starting };
    last = performance.now();
  }
});
addEventListener("pagehide", keep);

// Works offline once it has been opened, and can be added to the home screen.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
