import { FULL, grownUp, LIFE_PER_DAY, SKRUKKETROLL, type Animal, type World } from "../sim";
import { creatureIcon, iconCanvas } from "./icons";
import { t } from "./strings";

/** An animal's name. Which one comes from its number, so it is the same on every phone. */
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

/** Its weight in milligrams: it grows until it is grown up, and a full belly weighs a little. */
function weight(a: Animal): number {
  const grown = Math.min(1, a.age / (a.life / 3));
  return Math.round(44 * (0.15 + 0.85 * grown) + (a.energy / FULL) * 6);
}

function el(tag: string, cls = "", text = ""): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * The card that comes up when the magnifying glass finds an animal: who it
 * is, how old, how heavy, how full, and its family. It only reads the
 * glass. Tapping it closes it.
 */
export class CreatureCard {
  readonly el = document.createElement("div");
  animal: Animal | null = null;

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

  show(a: Animal, w: World): void {
    this.animal = a;
    this.el.hidden = false;
    this.update(w);
  }

  hide(): void {
    this.animal = null;
    this.el.hidden = true;
  }

  /** Is the animal on the card still alive in this glass? */
  alive(w: World): boolean {
    const a = this.animal;
    return a !== null && !a.dead && w.animals.includes(a);
  }

  update(w: World): void {
    const a = this.animal;
    if (!a) return;
    const alive = this.alive(w);
    const age = t.card.days(a.age / LIFE_PER_DAY);
    const head = el("div", "card-head");
    const words = el("div");
    words.append(
      el("strong", "", creatureName(a.id)),
      el("span", "card-sub", alive ? `${SKRUKKETROLL.name} · ${t.card.stage(grownUp(a), a.age > a.life * 0.8)}` : a.starved ? t.card.starved(age) : t.card.died(age)),
    );
    head.append(iconCanvas(creatureIcon(SKRUKKETROLL.color, this.light, this.dark)), words);

    const rows = el("dl", "card-rows");
    const row = (label: string, value: HTMLElement | string) => {
      const v = el("dd");
      if (typeof value === "string") v.textContent = value;
      else v.append(value);
      rows.append(el("dt", "", label), v);
    };
    row(t.card.age, age);
    row(t.card.weight, t.card.mg(weight(a)));
    if (alive) {
      const f = Math.min(1, a.energy / FULL);
      const bar = el("span", "card-bar");
      const fill = el("span", "card-fill");
      fill.style.width = `${Math.round(f * 100)}%`;
      bar.append(fill);
      bar.setAttribute("aria-label", f < 0.5 ? t.card.hungry : t.card.full);
      row(f < 0.5 ? t.card.hungry : t.card.full, bar);
    }
    row(t.card.young, String(a.young));
    row(t.card.mother, a.mother ? creatureName(a.mother) : t.card.fromOutside);
    this.el.classList.toggle("gone", !alive);
    this.el.replaceChildren(head, rows);
  }
}
