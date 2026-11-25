import { iconCanvas, type Icon } from "./icons";

export interface PickerItem {
  label: string;
  icon: Icon;
}

/**
 * A small row that pops up above a tool, for choosing which seed or creature
 * to use. Choosing closes it.
 */
export class Picker {
  readonly el = document.createElement("div");
  private items: HTMLButtonElement[] = [];

  constructor(
    label: string,
    private onPick: (index: number) => void,
  ) {
    this.el.className = "picker";
    this.el.setAttribute("role", "group");
    this.el.setAttribute("aria-label", label);
    this.el.hidden = true;
  }

  /** Sets the choices; with `onNew`, a last «＋ Ny» item makes a new one. */
  setItems(items: PickerItem[], selected: number, onNew?: { label: string; open: () => void }): void {
    this.el.replaceChildren();
    this.items = items.map((item, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      b.setAttribute("aria-label", item.label);
      const name = document.createElement("span");
      name.textContent = item.label;
      b.append(iconCanvas(item.icon), name);
      b.addEventListener("click", () => {
        this.select(k);
        this.onPick(k);
        this.close();
      });
      this.el.append(b);
      return b;
    });
    if (onNew) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick new";
      b.setAttribute("aria-label", onNew.label);
      const plus = document.createElement("span");
      plus.className = "plus";
      plus.textContent = "+";
      plus.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = onNew.label;
      b.append(plus, name);
      b.addEventListener("click", () => {
        this.close();
        onNew.open();
      });
      this.el.append(b);
    }
    this.select(selected);
  }

  select(k: number): void {
    this.items.forEach((b, j) => b.setAttribute("aria-pressed", String(j === k)));
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Opens the row above the given point (page coordinates). */
  openAt(centerX: number, bottom: number): void {
    this.el.hidden = false;
    const w = this.el.offsetWidth;
    const left = Math.max(8, Math.min(innerWidth - w - 8, centerX - w / 2));
    this.el.style.left = `${left}px`;
    this.el.style.bottom = `${bottom}px`;
  }

  close(): void {
    this.el.hidden = true;
  }
}
