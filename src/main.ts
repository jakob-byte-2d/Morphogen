import { DT, countOrganisms, createWorld, stepWorld, type World } from "./engine";
import { DEFAULT_PRESET, PRESETS, PRESET_IDS, isPresetId, type PresetId } from "./genome/presets";
import { render } from "./ui/renderer";
import { strings } from "./ui/strings";
import "./ui/style.css";

const SPEEDS = [1, 4, 16, 64];
/**
 * Time per frame we allow the simulation to use. If a phone cannot keep up
 * with the chosen speed, the game simply runs slower instead of freezing.
 */
const FRAME_BUDGET_MS = 12;

const canvas = document.querySelector<HTMLCanvasElement>("#dish")!;
const stats = document.querySelector<HTMLDivElement>("#stats")!;
const presetSelect = document.querySelector<HTMLSelectElement>("#preset")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const speedButton = document.querySelector<HTMLButtonElement>("#speed")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

// Seed and organism live in the URL (?seed=123&genome=alge), so a dish can be
// shared and replayed exactly. Math.random is fine here: it only picks the
// seed, it never runs inside the simulation.
const params = new URLSearchParams(location.search);

function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999999);
}

function seedFromUrl(): number {
  const value = Number(params.get("seed"));
  return Number.isInteger(value) && value > 0 ? value : newSeed();
}

function presetFromUrl(): PresetId {
  const value = params.get("genome");
  return isPresetId(value) ? value : DEFAULT_PRESET;
}

let preset = presetFromUrl();
let world: World = makeWorld(seedFromUrl());
let running = true;
let speedIndex = 0;
let accumulator = 0;
let lastTime = performance.now();

function makeWorld(seed: number): World {
  const w = createWorld(seed, { genomes: [PRESETS[preset]] });
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("genome", preset);
  history.replaceState(null, "", url);
  accumulator = 0;
  return w;
}

for (const id of PRESET_IDS) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = PRESETS[id].name;
  presetSelect.append(option);
}
presetSelect.value = preset;
presetSelect.setAttribute("aria-label", strings.organism);

function updateButtons(): void {
  playButton.textContent = running ? strings.pause : strings.play;
  speedButton.textContent = strings.speed(SPEEDS[speedIndex]);
  resetButton.textContent = strings.newDish;
}

presetSelect.addEventListener("change", () => {
  if (!isPresetId(presetSelect.value)) return;
  preset = presetSelect.value;
  // Same seed, new organism: easy to compare organisms in the same dish.
  world = makeWorld(world.seed);
});

playButton.addEventListener("click", () => {
  running = !running;
  updateButtons();
});

speedButton.addEventListener("click", () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  updateButtons();
});

resetButton.addEventListener("click", () => {
  world = makeWorld(newSeed());
});

function frame(now: number): void {
  // Real time only decides HOW MANY fixed ticks to run. The simulation itself
  // never sees real time, which is what keeps it deterministic.
  const elapsed = Math.min(now - lastTime, 250) / 1000;
  lastTime = now;
  if (running) {
    accumulator += elapsed * SPEEDS[speedIndex];
    const start = performance.now();
    while (accumulator >= DT) {
      stepWorld(world);
      accumulator -= DT;
      if (performance.now() - start > FRAME_BUDGET_MS) {
        // Behind schedule: drop the backlog rather than spiral.
        accumulator = 0;
        break;
      }
    }
  }

  render(canvas, world);
  stats.textContent = strings.stats({
    seconds: Math.floor(world.tick * DT),
    organisms: countOrganisms(world),
    cells: world.cells.length,
    seed: world.seed,
  });
  requestAnimationFrame(frame);
}

updateButtons();
requestAnimationFrame(frame);
