import { CREATURE_EVERY, fullness, grownUp, LIFE_EVERY, lifespanOf, TICKS_PER_SECOND, type Creature, type World } from "../sim";
import { creatureIcon, iconCanvas } from "./icons";
import { t } from "./strings";

/** A creature's name. Which one comes from its number, so it is the same on every phone. */
export function creatureName(id: number): string {
  // Stir the number well, so neighbours (mother and young) get different names.
  let h = id >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return t.names[(h >>> 0) % t.names.length];
}

/** Days lived, from creature updates. */
function days(updates: number): number {
  return (updates * CREATURE_EVERY * LIFE_EVERY) / TICKS_PER_SECOND / 86400;
}

/**
 * Its weight in milligrams: it grows until it is grown up (big-bodied ones
 * grow bigger), and what it has eaten and not yet passed on weighs too.
 */
function weight(c: Creature): number {
  const grown = Math.min(1, c.age / (lifespanOf(c) / 3));
  const adult = 20 + 8 * c.genes.size;
  return Math.round(adult * (0.15 + 0.85 * grown) + Math.min(c.store, 20) * 0.5);
}

const TRAITS = ["size", "speed", "growth"] as const;

function el(tag: string, cls = "", text = ""): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * The card that comes up when the magnifying glass finds a creature: who it
 * is, how old, how heavy, how full, and its family. It only reads the glass.
 * Tapping it closes it.
 */
export class CreatureCard {
  readonly el = document.createElement("div");
  creature: Creature | null = null;

  constructor(
    private light: (c: string) => string,
    private dark: (c: string) => string,
    onClose: () => void,
  ) {
    this.el.className = "card";
    this.el.hidden = true;
    this.el.setAttribute("aria-live", "polite");
    this.el.setAttribute("aria-label", t.card.close);
    this.el.addEventListener("click", onClose);
  }

  show(c: Creature, w: World): void {
    this.creature = c;
    this.el.hidden = false;
    this.update(w);
  }

  hide(): void {
    this.creature = null;
    this.el.hidden = true;
  }

  /** Is the creature on the card still alive in this glass? */
  alive(w: World): boolean {
    const c = this.creature;
    return c !== null && !c.dead && w.orgs.get(c.id) === c;
  }

  update(w: World): void {
    const c = this.creature;
    if (!c) return;
    const sp = w.creatureSpecies[c.species] ?? w.creatureSpecies[0];
    const alive = this.alive(w);
    const age = t.card.days(days(c.age));

    const head = el("div", "card-head");
    const words = el("div");
    words.append(
      el("strong", "", creatureName(c.id)),
      el("span", "card-sub", alive ? `${sp.name} · ${t.card.stage(grownUp(c), c.age > lifespanOf(c) * 0.8)}` : c.energy <= 0 ? t.card.starved(age) : t.card.died(age)),
    );
    head.append(iconCanvas(creatureIcon(sp.diet, sp.color, this.light, this.dark)), words);

    const rows = el("dl", "card-rows");
    const row = (label: string, value: HTMLElement | string) => {
      const v = el("dd");
      if (typeof value === "string") v.textContent = value;
      else v.append(value);
      rows.append(el("dt", "", label), v);
    };
    row(t.card.age, age);
    row(t.card.weight, t.card.mg(weight(c)));
    if (alive) {
      const f = fullness(c);
      const bar = el("span", "card-bar");
      const fill = el("span", "card-fill");
      fill.style.width = `${Math.round(f * 100)}%`;
      bar.append(fill);
      bar.setAttribute("aria-label", f < 0.5 ? t.card.hungry : t.card.full);
      row(f < 0.5 ? t.card.hungry : t.card.full, bar);
    }
    row(t.card.young, String(c.young));
    row(t.card.mother, c.mother ? creatureName(c.mother) : t.card.fromOutside);
    const traits = el("p", "card-traits");
    traits.textContent = TRAITS.map((k) => `${t.traitName(k, false)} ${"●".repeat(c.genes[k])}${"○".repeat(5 - c.genes[k])}`).join("   ");

    this.el.classList.toggle("gone", !alive);
    this.el.replaceChildren(head, rows, traits);
  }
}
