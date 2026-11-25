import type { CreatureSpecies, PlantForm, PlantSpecies } from "../sim";
import { creatureIcon, iconCanvas, plantIcon } from "./icons";
import { t } from "./strings";

const LEAF_COLORS = ["#4f8a3a", "#3d6a34", "#6a9a4a", "#2f6a5a", "#8a7a3e", "#7a4a6a"];
const FLOWER_COLORS = ["#e7a0b0", "#f0d070", "#c97a8a", "#8ab0e0", "#f2f0e8", "#e08a4a"];
const CREATURE_COLORS = ["#b8d86a", "#d8b040", "#d6a8a4", "#8ad0e0", "#e07a6a", "#b08ad8", "#f0f0e0", "#7a7a8a"];

const LIFESPAN: Record<PlantForm, number> = { grass: 420, flower: 540, bush: 1500 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The «make your own» sheet: a handful of natural choices and a live
 * picture of what you are making.
 */
export class Creator {
  readonly el = el("div", "creator");

  constructor(
    private light: (c: string) => string,
    private dark: (c: string) => string,
  ) {
    this.el.setAttribute("role", "dialog");
    this.el.hidden = true;
  }

  close(): void {
    this.el.hidden = true;
  }

  private frame(title: string): { body: HTMLElement; preview: HTMLElement; actions: HTMLElement } {
    this.el.replaceChildren();
    this.el.setAttribute("aria-label", title);
    const head = el("div", "creator-head");
    const preview = el("div", "creator-preview");
    head.append(preview, el("h2", "", title));
    const body = el("div", "creator-body");
    const actions = el("div", "creator-actions");
    this.el.append(head, body, actions);
    this.el.hidden = false;
    return { body, preview, actions };
  }

  private row(body: HTMLElement, label: string, control: HTMLElement): void {
    const r = el("div", "creator-row");
    r.append(el("span", "creator-label", label), control);
    body.append(r);
  }

  private choices<T>(options: [T, string][], value: T, onPick: (v: T) => void, label: string): HTMLElement {
    const g = el("div", "segments");
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", label);
    for (const [v, text] of options) {
      const b = el("button", "segment", text);
      b.type = "button";
      b.setAttribute("aria-pressed", String(v === value));
      b.addEventListener("click", () => {
        for (const o of g.children) o.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        onPick(v);
      });
      g.append(b);
    }
    return g;
  }

  private swatches(colors: string[], value: string, onPick: (c: string) => void, label: string): HTMLElement {
    const g = el("div", "swatches");
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", label);
    for (const c of colors) {
      const b = el("button", "swatch");
      b.type = "button";
      b.style.background = c;
      b.setAttribute("aria-label", c);
      b.setAttribute("aria-pressed", String(c === value));
      b.addEventListener("click", () => {
        for (const o of g.children) o.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        onPick(c);
      });
      g.append(b);
    }
    return g;
  }

  private actions(actions: HTMLElement, onMake: () => void): void {
    const cancel = el("button", "creator-button", t.creator.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const make = el("button", "creator-button primary", t.creator.make);
    make.type = "button";
    make.addEventListener("click", () => {
      this.close();
      onMake();
    });
    actions.append(cancel, make);
  }

  /** A trait from low to high, with what each end means underneath. */
  private trait(body: HTMLElement, id: keyof typeof t.creator.traits, value: number, min: number, onChange: (v: number) => void): void {
    const box = el("div", "trait");
    const range = el("input", "creator-range");
    range.type = "range";
    range.min = String(min);
    range.max = "5";
    range.step = "1";
    range.value = String(value);
    range.setAttribute("aria-label", t.creator.traits[id]);
    range.addEventListener("input", () => onChange(Number(range.value)));
    const ends = el("div", "trait-ends");
    const [low, high] = t.creator.ends[id];
    ends.append(el("span", "", low), el("span", "", high));
    box.append(range, ends);
    this.row(body, t.creator.traits[id], box);
  }

  private nameField(body: HTMLElement, value: string, onChange: (v: string) => void): void {
    const input = el("input", "creator-name");
    input.type = "text";
    input.maxLength = 24;
    input.value = value;
    input.setAttribute("aria-label", t.creator.name);
    input.addEventListener("input", () => onChange(input.value));
    this.row(body, t.creator.name, input);
  }

  openPlant(number: number, onMake: (sp: PlantSpecies) => void): void {
    const { body, preview, actions } = this.frame(t.creator.newPlant);
    const sp: PlantSpecies = {
      name: t.creator.plantName(number),
      form: "flower",
      height: 18,
      branches: 0,
      leaves: 2,
      rootDepth: 10,
      lifespan: LIFESPAN.flower,
      colors: { leaf: LEAF_COLORS[0], stem: this.dark(LEAF_COLORS[0]), flower: FLOWER_COLORS[0], seed: "#a08c48" },
      traits: { growth: 3, seed: 3, mutation: 1 },
    };
    const draw = () => preview.replaceChildren(iconCanvas(plantIcon(sp.form, sp.colors, this.light, this.dark)));
    draw();
    this.nameField(body, sp.name, (v) => (sp.name = v));
    const forms: [PlantForm, string][] = (["grass", "flower", "bush"] as PlantForm[]).map((f) => [f, t.creator.forms[f]]);
    this.row(
      body,
      t.creator.form,
      this.choices(forms, sp.form, (f) => {
        sp.form = f;
        sp.lifespan = LIFESPAN[f];
        draw();
      }, t.creator.form),
    );
    this.row(
      body,
      t.creator.leafColor,
      this.swatches(LEAF_COLORS, sp.colors.leaf, (c) => {
        sp.colors.leaf = c;
        sp.colors.stem = this.dark(c);
        draw();
      }, t.creator.leafColor),
    );
    this.row(
      body,
      t.creator.flowerColor,
      this.swatches(FLOWER_COLORS, sp.colors.flower, (c) => {
        sp.colors.flower = c;
        draw();
      }, t.creator.flowerColor),
    );
    const height = el("input", "creator-range");
    height.type = "range";
    height.min = "4";
    height.max = "36";
    height.value = String(sp.height);
    height.setAttribute("aria-label", t.creator.height);
    height.addEventListener("input", () => {
      sp.height = Number(height.value);
      sp.rootDepth = Math.max(4, Math.min(16, sp.height >> 1));
    });
    this.row(body, t.creator.height, height);
    this.row(body, t.creator.branches, this.choices([0, 1, 2, 3].map((n) => [n, String(n)] as [number, string]), sp.branches, (n) => (sp.branches = n), t.creator.branches));
    this.trait(body, "plantGrowth", sp.traits.growth, 1, (v) => (sp.traits.growth = v));
    this.trait(body, "seed", sp.traits.seed, 1, (v) => (sp.traits.seed = v));
    this.trait(body, "mutation", sp.traits.mutation, 0, (v) => (sp.traits.mutation = v));
    this.actions(actions, () => onMake(sp));
  }

  openCreature(number: number, onMake: (sp: CreatureSpecies) => void): void {
    const { body, preview, actions } = this.frame(t.creator.newCreature);
    const sp: CreatureSpecies = {
      name: t.creator.creatureName(number),
      diet: "litter",
      color: CREATURE_COLORS[3],
      traits: { size: 3, speed: 3, growth: 3, mutation: 1 },
    };
    const draw = () => preview.replaceChildren(iconCanvas(creatureIcon(sp.diet, sp.color, this.light, this.dark)));
    draw();
    this.nameField(body, sp.name, (v) => (sp.name = v));
    this.row(
      body,
      t.creator.color,
      this.swatches(CREATURE_COLORS, sp.color, (c) => {
        sp.color = c;
        draw();
      }, t.creator.color),
    );
    this.trait(body, "size", sp.traits.size, 1, (v) => (sp.traits.size = v));
    this.trait(body, "speed", sp.traits.speed, 1, (v) => (sp.traits.speed = v));
    this.trait(body, "growth", sp.traits.growth, 1, (v) => (sp.traits.growth = v));
    this.trait(body, "mutation", sp.traits.mutation, 0, (v) => (sp.traits.mutation = v));
    this.actions(actions, () => onMake(sp));
  }
}
