import { DT, createWorld, stepWorld, type World } from "./engine";
import { render } from "./ui/renderer";
import { strings } from "./ui/strings";
import "./ui/style.css";

const SPEEDS = [1, 4, 16, 64];
/** Safety cap so a slow phone never freezes trying to catch up. */
const MAX_TICKS_PER_FRAME = 400;

const canvas = document.querySelector<HTMLCanvasElement>("#dish")!;
const stats = document.querySelector<HTMLDivElement>("#stats")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const speedButton = document.querySelector<HTMLButtonElement>("#speed")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

// The seed lives in the URL (?seed=123), so a dish can be shared and replayed exactly.
// Math.random is fine here: it only picks the seed, it never runs inside the simulation.
function seedFromUrl(): number {
  const value = Number(new URLSearchParams(location.search).get("seed"));
  return Number.isInteger(value) && value > 0 ? value : newSeed();
}

function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999999);
}

function setSeedInUrl(seed: number): void {
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
}

let world: World = createWorld(seedFromUrl());
setSeedInUrl(world.seed);
let running = true;
let speedIndex = 0;
let accumulator = 0;
let lastTime = performance.now();

function updateButtons(): void {
  playButton.textContent = running ? strings.pause : strings.play;
  speedButton.textContent = strings.speed(SPEEDS[speedIndex]);
  resetButton.textContent = strings.newDish;
}

playButton.addEventListener("click", () => {
  running = !running;
  updateButtons();
});

speedButton.addEventListener("click", () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  updateButtons();
});

resetButton.addEventListener("click", () => {
  world = createWorld(newSeed());
  setSeedInUrl(world.seed);
  accumulator = 0;
});

function frame(now: number): void {
  // Real time only decides HOW MANY fixed ticks to run. The simulation itself
  // never sees real time, which is what keeps it deterministic.
  const elapsed = Math.min(now - lastTime, 250) / 1000;
  lastTime = now;
  if (running) {
    accumulator += elapsed * SPEEDS[speedIndex];
    let ticks = Math.floor(accumulator / DT);
    if (ticks > MAX_TICKS_PER_FRAME) {
      ticks = MAX_TICKS_PER_FRAME;
      accumulator = 0;
    } else {
      accumulator -= ticks * DT;
    }
    for (let i = 0; i < ticks; i++) stepWorld(world);
  }

  render(canvas, world);
  stats.textContent = strings.stats({
    seconds: Math.floor(world.tick * DT),
    cells: world.cells.length,
    food: world.food.length,
    seed: world.seed,
  });
  requestAnimationFrame(frame);
}

updateButtons();
requestAnimationFrame(frame);
