import { LIFE_EVERY, SIM_VERSION, TICKS_PER_SECOND, type World } from "../sim";
import { PLANT_EVERY } from "../sim/plants";
import { creatureIcon, iconCanvas, ICONS, plantIcon } from "./icons";
import type { Settings } from "./settings";
import { sample, type History } from "./stats";
import { t } from "./strings";

export interface MenuHost {
  world(): World;
  settings: Settings;
  /** Called after a setting changed (it is already in `settings`). */
  settingsChanged(): void;
  history(): History;
  snapshot(): HTMLCanvasElement;
  newGlass(): void;
  toggleDev(): void;
  version: string;
  light(c: string): string;
  dark(c: string): string;
}

type Page = "settings" | "info" | "stats" | "species" | "help";

const PLANT_TRAITS = ["growth", "seed", "mutation"] as const;
const CREATURE_TRAITS = ["size", "speed", "growth", "mutation"] as const;

/** One decimal, Norwegian style. */
function dec(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** "Fart 3 · Størrelse 3 · …" for a species' starting traits. */
function traitLine(names: readonly string[], values: Record<string, number>, plant: boolean): string {
  return names.map((k) => `${t.traitName(k, plant)} ${values[k]}`).join(" · ");
}

/** Average genes of the living individuals of a species, or null if none live. */
function averages(list: { genes: object }[], names: readonly string[]): { n: number; text: string } | null {
  if (list.length === 0) return null;
  const parts = names.map((k) => {
    let sum = 0;
    for (const x of list) sum += (x.genes as Record<string, number>)[k];
    return `${t.traitName(k, false).toLowerCase()} ${dec(sum / list.length)}`;
  });
  return { n: list.length, text: parts.join(" · ") };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A tiny line chart of a series, as SVG. */
function sparkline(values: number[]): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 24");
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");
  if (values.length > 1) {
    const max = Math.max(1, ...values);
    const pts = values.map((v, k) => `${((k / (values.length - 1)) * 100).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`).join(" ");
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts);
    svg.append(line);
  }
  return svg;
}

/** The ☰ menu in the top right corner, with its pages. */
export class Menu {
  readonly button = el("button", "menu-button");
  private backdrop = el("div", "menu-backdrop");
  private panel = el("div", "menu");
  private devTaps = 0;

  constructor(
    parent: HTMLElement,
    private host: MenuHost,
  ) {
    this.button.type = "button";
    this.button.setAttribute("aria-label", t.menu.open);
    this.button.setAttribute("aria-expanded", "false");
    this.button.innerHTML =
      '<svg width="21" height="21" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="1" width="5" height="1"/><rect x="1" y="3" width="5" height="1"/><rect x="1" y="5" width="5" height="1"/></svg>';
    this.button.addEventListener("click", () => (this.isOpen ? this.close() : this.open()));
    this.backdrop.addEventListener("pointerdown", () => this.close());
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", t.menu.open);
    this.backdrop.hidden = true;
    this.panel.hidden = true;
    parent.append(this.backdrop, this.panel, this.button);
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  open(): void {
    this.showMain();
    this.panel.hidden = false;
    this.backdrop.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
  }

  close(): void {
    this.panel.hidden = true;
    this.backdrop.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
  }

  private showMain(): void {
    const items: [string, () => void, string?][] = [
      [t.menu.settings, () => this.show("settings")],
      [t.menu.info, () => this.show("info")],
      [t.menu.stats, () => this.show("stats")],
      [t.menu.species, () => this.show("species")],
      [t.menu.help, () => this.show("help")],
      [t.menu.snapshot, () => this.snapshot()],
      [t.menu.newGlass, () => this.confirmNewGlass(), "danger"],
    ];
    const list = el("div", "menu-list");
    for (const [label, fn, cls] of items) {
      if (cls === "danger") list.append(el("div", "menu-rule"));
      const b = el("button", `menu-item${cls ? " " + cls : ""}`, label);
      b.type = "button";
      b.addEventListener("click", fn);
      list.append(b);
    }
    this.panel.replaceChildren(list);
  }

  private page(title: string): HTMLElement {
    const head = el("div", "menu-head");
    const back = el("button", "menu-back", "←");
    back.type = "button";
    back.setAttribute("aria-label", t.menu.back);
    back.addEventListener("click", () => this.showMain());
    head.append(back, el("h2", "", title));
    const body = el("div", "menu-body");
    this.panel.replaceChildren(head, body);
    return body;
  }

  private show(page: Page): void {
    if (page === "settings") this.showSettings();
    else if (page === "info") this.showInfo();
    else if (page === "stats") this.showStats();
    else if (page === "species") this.showSpecies();
    else this.showHelp();
  }

  private showSettings(): void {
    const body = this.page(t.menu.settings);
    const s = this.host.settings;
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const row = el("label", "setting");
      const box = el("input");
      box.type = "checkbox";
      box.checked = get();
      box.addEventListener("change", () => {
        set(box.checked);
        this.host.settingsChanged();
      });
      row.append(el("span", "", label), box);
      body.append(row);
    };
    toggle(t.settings.vibration, () => s.vibration, (v) => (s.vibration = v));
    toggle(t.settings.timeAway, () => s.timeAway, (v) => (s.timeAway = v));
    const row = el("div", "setting");
    row.append(el("span", "", t.settings.speed));
    const group = el("div", "segments");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t.settings.speed);
    for (const v of [1, 2, 4]) {
      const b = el("button", "segment", `${v}×`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(s.speed === v));
      b.addEventListener("click", () => {
        s.speed = v;
        this.host.settingsChanged();
        this.showSettings();
      });
      group.append(b);
    }
    row.append(group);
    body.append(row);
  }

  private showInfo(): void {
    const body = this.page(t.menu.info);
    body.append(el("p", "", t.info.text));
    body.append(this.cycleFigure());
    body.append(el("p", "note", t.info.cycleNote));
    // Seven taps on the version turn developer mode on or off.
    const version = el("button", "version", t.info.version(this.host.version, SIM_VERSION));
    version.type = "button";
    version.addEventListener("click", () => {
      if (++this.devTaps < 7) return;
      this.devTaps = 0;
      this.host.toggleDev();
      version.textContent = this.host.settings.devMode ? t.info.devOn : t.info.devOff;
    });
    body.append(version);
  }

  /** The cycle as a ring of five labels with arrows between them. */
  private cycleFigure(): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 300 200");
    svg.setAttribute("class", "cycle");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", t.info.cycle.join(" → ") + " → " + t.info.cycle[0]);
    const n = t.info.cycle.length;
    const pos = t.info.cycle.map((_, k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
      return [150 + 92 * Math.cos(a), 100 + 74 * Math.sin(a)];
    });
    for (let k = 0; k < n; k++) {
      const [x1, y1] = pos[k];
      const [x2, y2] = pos[(k + 1) % n];
      const line = document.createElementNS(ns, "line");
      const f = 0.32;
      line.setAttribute("x1", String(x1 + (x2 - x1) * f));
      line.setAttribute("y1", String(y1 + (y2 - y1) * f));
      line.setAttribute("x2", String(x1 + (x2 - x1) * (1 - f)));
      line.setAttribute("y2", String(y1 + (y2 - y1) * (1 - f)));
      line.setAttribute("marker-end", "url(#arrow)");
      svg.append(line);
    }
    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z"/></marker>';
    svg.prepend(defs);
    t.info.cycle.forEach((label, k) => {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(pos[k][0]));
      text.setAttribute("y", String(pos[k][1] + 5));
      text.setAttribute("text-anchor", "middle");
      text.textContent = label;
      svg.append(text);
    });
    return svg;
  }

  private showStats(): void {
    const body = this.page(t.menu.stats);
    const w = this.host.world();
    const h = this.host.history();
    body.append(el("p", "", t.stats.age(t.stats.duration(w.tick / TICKS_PER_SECOND))));
    const series = (label: string, values: number[], now: number | string, genes?: string) => {
      const row = el("div", "stat");
      row.append(el("span", "stat-label", label), sparkline(values), el("span", "stat-value", String(now)));
      body.append(row);
      // How the species is doing in its genes right now.
      if (genes) body.append(el("p", "stat-genes", genes));
    };
    const s = h.samples;
    body.append(el("h3", "", t.stats.plants));
    w.plantSpecies.forEach((sp, k) => {
      const list = w.plants.filter((p) => p.species === k);
      series(sp.name, s.map((x) => x.plants[k] ?? 0), list.length, averages(list, PLANT_TRAITS)?.text);
    });
    body.append(el("h3", "", t.stats.creatures));
    w.creatureSpecies.forEach((sp, k) => {
      const list = w.creatures.filter((c) => c.species === k);
      series(sp.name, s.map((x) => x.creatures[k] ?? 0), list.length, averages(list, CREATURE_TRAITS)?.text);
    });
    body.append(el("h3", "", t.stats.glass));
    const now = sample(w);
    series(t.stats.water, s.map((x) => x.water), Math.round(now.water / 32));
    series(t.stats.soilFood, s.map((x) => x.soilFood), now.soilFood);
    series(t.stats.waste, s.map((x) => x.waste), now.waste);
    body.append(el("h3", "", t.stats.records));
    const oldest = (h.oldestPlant * PLANT_EVERY * LIFE_EVERY) / TICKS_PER_SECOND;
    body.append(el("p", "", t.stats.oldestPlant(t.stats.duration(oldest))), el("p", "", t.stats.mostCreatures(h.biggestPopulation)));
  }

  private showSpecies(): void {
    const body = this.page(t.menu.species);
    const w = this.host.world();
    const row = (icon: HTMLCanvasElement, name: string, text: string) => {
      const r = el("div", "species");
      const words = el("div");
      words.append(el("strong", "", name), el("p", "", text));
      r.append(icon, words);
      body.append(r);
    };
    const lines = (about: string, start: string, now: { n: number; text: string } | null) =>
      [about, start, now ? t.speciesNow(now.n, now.text) : ""].filter(Boolean).join("\n");
    w.plantSpecies.forEach((sp, k) => {
      const now = averages(w.plants.filter((p) => p.species === k), PLANT_TRAITS);
      row(iconCanvas(plantIcon(sp.form, sp.colors, this.host.light, this.host.dark)), sp.name, lines(t.about[sp.form], traitLine(PLANT_TRAITS, sp.traits, true), now));
    });
    w.creatureSpecies.forEach((sp, k) => {
      const now = averages(w.creatures.filter((c) => c.species === k), CREATURE_TRAITS);
      row(iconCanvas(creatureIcon(sp.diet, sp.color, this.host.light, this.host.dark)), sp.name, lines(t.about[sp.diet], traitLine(CREATURE_TRAITS, sp.traits, false), now));
    });
  }

  private showHelp(): void {
    const body = this.page(t.menu.help);
    for (const id of ["water", "soil", "seed", "creature", "feed", "spade"]) {
      const r = el("div", "species");
      const words = el("div");
      words.append(el("strong", "", t.tool[id]), el("p", "", t.help[id]));
      r.append(iconCanvas(ICONS[id]), words);
      body.append(r);
    }
    body.append(el("p", "note", t.help.zoom));
  }

  private snapshot(): void {
    this.close();
    const canvas = this.host.snapshot();
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], t.snapshotName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch {
          // Cancelled: fall through to saving it.
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = t.snapshotName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  private confirmNewGlass(): void {
    const body = this.page(t.menu.newGlass);
    body.append(el("p", "", t.newGlass.question));
    const yes = el("button", "menu-item danger", t.newGlass.yes);
    yes.type = "button";
    yes.addEventListener("click", () => {
      this.close();
      this.host.newGlass();
    });
    const no = el("button", "menu-item", t.newGlass.no);
    no.type = "button";
    no.addEventListener("click", () => this.showMain());
    body.append(yes, no);
  }
}
