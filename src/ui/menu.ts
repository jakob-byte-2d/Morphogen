import { SIM_VERSION } from "../sim";
import { iconCanvas, ICONS } from "./icons";
import type { Settings } from "./settings";
import { t } from "./strings";

export interface MenuHost {
  settings: Settings;
  /** Called after a setting changed (it is already in `settings`). */
  settingsChanged(): void;
  snapshot(): HTMLCanvasElement;
  newGlass(): void;
  toggleDev(): void;
  version: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The ☰ menu in the top right corner: settings, information, help, a picture, a new glass. */
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
      [t.menu.settings, () => this.showSettings()],
      [t.menu.info, () => this.showInfo()],
      [t.menu.help, () => this.showHelp()],
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
  }

  private showInfo(): void {
    const body = this.page(t.menu.info);
    body.append(el("p", "", t.info.text));
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

  private showHelp(): void {
    const body = this.page(t.menu.help);
    for (const id of ["water", "soil", "seed", "creature", "spade", "look"]) {
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
