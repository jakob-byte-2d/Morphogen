import { iconCanvas, ICONS } from "./icons";
import { t } from "./strings";

/** The row of tool buttons at the bottom. One is always selected. */
export class Toolbar {
  readonly el = document.createElement("nav");
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(
    tools: string[],
    public selected: string,
    /** Called with again = true when the selected tool is tapped once more. */
    private onSelect: (tool: string, again: boolean) => void,
  ) {
    this.el.className = "toolbar";
    this.el.setAttribute("aria-label", t.tools);
    for (const id of tools) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool";
      b.setAttribute("aria-label", t.tool[id] ?? id);
      b.append(iconCanvas(ICONS[id]));
      b.addEventListener("click", () => this.select(id));
      b.dataset.tool = id;
      this.buttons.set(id, b);
      this.el.append(b);
    }
    this.select(selected, false);
  }

  select(id: string, notify = true): void {
    const again = id === this.selected;
    this.selected = id;
    for (const [k, b] of this.buttons) b.setAttribute("aria-pressed", String(k === id));
    if (notify) this.onSelect(id, again);
  }

  /** Horizontal centre of a tool's button, in page pixels. */
  centerOf(id: string): number {
    const b = this.buttons.get(id);
    if (!b) return innerWidth / 2;
    const r = b.getBoundingClientRect();
    return r.left + r.width / 2;
  }
}
