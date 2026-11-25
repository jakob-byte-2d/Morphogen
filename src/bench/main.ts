import { DT, ENGINE_VERSION, GOLDEN, createWorld, hashWorld, stepWorld } from "../engine";
import { strings } from "../ui/strings";
import "../ui/style.css";
import "./bench.css";
import { crowdedWorld } from "./scenario";

const t = strings.bench;
const COUNTS = [250, 500, 1000, 2000];
/** Share of each frame the game lets the simulation use (see FRAME_BUDGET_MS in main.ts). */
const SIM_SHARE = 12 / 16.7;
const MEASURE_MS = 1500;

const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const results = document.querySelector<HTMLTableSectionElement>("#results")!;
const verdict = document.querySelector<HTMLParagraphElement>("#verdict")!;
const hashBox = document.querySelector<HTMLDivElement>("#hash")!;

document.title = t.title;
document.querySelector("#title")!.textContent = t.title;
document.querySelector("#intro")!.textContent = t.intro;
document.querySelector("#col-cells")!.textContent = t.cells;
document.querySelector("#col-ms")!.textContent = t.msPerTick;
document.querySelector("#col-speed")!.textContent = t.maxSpeed;
document.querySelector("#back")!.textContent = t.back;
document.querySelector("#device")!.textContent = navigator.userAgent;
startButton.textContent = t.start;

/** Lets the browser draw between measurements. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Average milliseconds per tick for a dish with `count` cells. */
async function measure(count: number): Promise<number> {
  const w = crowdedWorld(count);
  for (let i = 0; i < 30; i++) stepWorld(w); // Warm up.
  let ticks = 0;
  let spent = 0;
  while (spent < MEASURE_MS) {
    const start = performance.now();
    for (let i = 0; i < 20; i++) stepWorld(w);
    spent += performance.now() - start;
    ticks += 20;
    await breathe();
  }
  return spent / ticks;
}

/** How many times real time the game can run, given milliseconds per tick. */
function maxSpeed(msPerTick: number): number {
  return (SIM_SHARE * 1000) / msPerTick / (1 / DT);
}

function addRow(cells: number, ms: number, speed: number): void {
  const row = document.createElement("tr");
  for (const text of [String(cells), ms.toFixed(2), speed >= 1 ? `${Math.floor(speed)}×` : "< 1×"]) {
    const td = document.createElement("td");
    td.textContent = text;
    row.append(td);
  }
  results.append(row);
}

async function goldenHash(): Promise<string> {
  const w = createWorld(GOLDEN.seed);
  for (let i = 0; i < GOLDEN.ticks; i += 500) {
    for (let k = 0; k < 500 && w.tick < GOLDEN.ticks; k++) stepWorld(w);
    await breathe();
  }
  return hashWorld(w);
}

async function run(): Promise<void> {
  startButton.disabled = true;
  startButton.textContent = t.running;
  results.replaceChildren();
  verdict.textContent = "";
  hashBox.textContent = "";

  let speedAt1000 = 0;
  for (const count of COUNTS) {
    const ms = await measure(count);
    const speed = maxSpeed(ms);
    if (count === 1000) speedAt1000 = speed;
    addRow(count, ms, speed);
  }
  verdict.textContent =
    speedAt1000 >= 1 ? t.verdictGood(1000, Math.floor(speedAt1000)) : t.verdictSlow(1000);

  const hash = await goldenHash();
  const ok = hash === GOLDEN.hash && ENGINE_VERSION === GOLDEN.engineVersion;
  hashBox.className = ok ? "hash ok" : "hash bad";
  hashBox.textContent = `${t.hashTitle}: ${hash} (v${ENGINE_VERSION}). ${ok ? t.hashMatch : `${t.hashMismatch} ${navigator.userAgent}`}`;

  startButton.disabled = false;
  startButton.textContent = t.start;
}

startButton.addEventListener("click", () => void run());
