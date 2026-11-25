import { DT, countOrganisms, createWorld, stepWorld, type Genome, type World } from "./engine";
import { decodeGenome, encodeGenome } from "./genome/codec";
import { DEFAULT_PRESET, PRESETS, PRESET_IDS, isPresetId, type PresetId } from "./genome/presets";
import { GenomeEditor } from "./ui/editor";
import { render } from "./ui/renderer";
import { strings } from "./ui/strings";
import "./ui/style.css";

const SPEEDS = [1, 4, 16, 64];
/**
 * Time per frame we allow the simulation to use. If a phone cannot keep up
 * with the chosen speed, the game simply runs slower instead of freezing.
 */
const FRAME_BUDGET_MS = 12;
const CUSTOM = "custom";
const STORAGE_KEY = "morphogen.customGenome";

type Choice = PresetId | typeof CUSTOM;

const canvas = document.querySelector<HTMLCanvasElement>("#dish")!;
const stats = document.querySelector<HTMLDivElement>("#stats")!;
const presetSelect = document.querySelector<HTMLSelectElement>("#preset")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const speedButton = document.querySelector<HTMLButtonElement>("#speed")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;
const editButton = document.querySelector<HTMLButtonElement>("#edit")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;

// Seed and organism live in the URL (?seed=123&genome=alge, or
// ?genome=custom&g=... for your own), so a dish can be shared and replayed
// exactly. Math.random is fine here: it only picks the seed, it never runs
// inside the simulation.
const params = new URLSearchParams(location.search);

function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999999);
}

function seedFromUrl(): number {
  const value = Number(params.get("seed"));
  return Number.isInteger(value) && value > 0 ? value : newSeed();
}

// Local storage can be missing or full; the game works without it.
function loadSavedGenome(): Genome | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? decodeGenome(saved) : null;
  } catch {
    return null;
  }
}

function saveGenome(g: Genome): void {
  try {
    localStorage.setItem(STORAGE_KEY, encodeGenome(g));
  } catch {
    // Not saved this time; the link still works.
  }
}

const linked = params.get("g");
let customGenome: Genome | null = (linked ? decodeGenome(linked) : null) ?? loadSavedGenome();
let choice: Choice = (() => {
  const value = params.get("genome");
  if (value === CUSTOM && customGenome) return CUSTOM;
  return isPresetId(value) ? value : DEFAULT_PRESET;
})();

function currentGenome(): Genome {
  return choice === CUSTOM && customGenome ? customGenome : PRESETS[choice as PresetId];
}

function urlFor(seed: number, c: Choice, genome: Genome | null): URL {
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("genome", c);
  if (c === CUSTOM && genome) url.searchParams.set("g", encodeGenome(genome));
  else url.searchParams.delete("g");
  return url;
}

let world: World = makeWorld(seedFromUrl());
let running = true;
let speedIndex = 0;
let accumulator = 0;
let lastTime = performance.now();

function makeWorld(seed: number): World {
  const w = createWorld(seed, { genomes: [currentGenome()] });
  history.replaceState(null, "", urlFor(seed, choice, customGenome));
  accumulator = 0;
  return w;
}

function fillPresetSelect(): void {
  presetSelect.replaceChildren();
  for (const id of PRESET_IDS) {
    presetSelect.append(new Option(PRESETS[id].name, id));
  }
  if (customGenome) {
    presetSelect.append(new Option(customGenome.name || strings.editor.custom, CUSTOM));
  }
  presetSelect.value = choice;
}

fillPresetSelect();
presetSelect.setAttribute("aria-label", strings.organism);

const editor = new GenomeEditor({
  root: editorRoot,
  presets: PRESETS,
  onApply: (genome) => {
    customGenome = genome;
    saveGenome(genome);
    choice = CUSTOM;
    fillPresetSelect();
    world = makeWorld(world.seed);
  },
  shareLink: (genome) => urlFor(world.seed, CUSTOM, genome).toString(),
});

function updateButtons(): void {
  playButton.textContent = running ? strings.pause : strings.play;
  speedButton.textContent = strings.speed(SPEEDS[speedIndex]);
  resetButton.textContent = strings.newDish;
  editButton.textContent = strings.editor.open;
}

presetSelect.addEventListener("change", () => {
  const value = presetSelect.value;
  if (value === CUSTOM && customGenome) choice = CUSTOM;
  else if (isPresetId(value)) choice = value;
  else return;
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

editButton.addEventListener("click", () => editor.open(currentGenome()));

function frame(now: number): void {
  // Real time only decides HOW MANY fixed ticks to run. The simulation itself
  // never sees real time, which is what keeps it deterministic.
  const elapsed = Math.min(now - lastTime, 250) / 1000;
  lastTime = now;
  // While the editor is open, the main dish pauses so the preview gets the CPU.
  if (running && editorRoot.hidden) {
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

  if (editorRoot.hidden) {
    render(canvas, world);
    stats.textContent = strings.stats({
      seconds: Math.floor(world.tick * DT),
      organisms: countOrganisms(world),
      cells: world.cells.length,
      seed: world.seed,
    });
  }
  requestAnimationFrame(frame);
}

updateButtons();
requestAnimationFrame(frame);
