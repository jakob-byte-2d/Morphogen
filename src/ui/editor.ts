import { CELL_TYPES, GENOME_LIMITS, type CellType, type Genome, type Mode } from "../engine";
import { canonical } from "../genome/codec";
import { addMode, removeMode, setName, setStartMode, updateMode } from "../genome/edit";
import { Preview } from "./preview";
import { strings } from "./strings";

const t = strings.editor;
const DEG = 180 / Math.PI;

export interface EditorOptions {
  /** Element the editor is drawn into. Hidden while the editor is closed. */
  root: HTMLElement;
  /** Ready-made genomes the player can start from. */
  presets: Record<string, Genome>;
  /** Called with the finished genome when the player taps "use in dish". */
  onApply: (genome: Genome) => void;
  /** Returns a link that opens the game with this genome. */
  shareLink: (genome: Genome) => string;
}

/** Small helper for building DOM elements. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) node.className = className;
  Object.assign(node, rest);
  node.append(...children);
  return node;
}

function slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
  onInput: (v: number) => void,
): HTMLElement {
  const output = el("output", {}, format(value));
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
  input.value = String(value);
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    output.textContent = format(v);
    onInput(v);
  });
  return el("label", { class: "field range" }, el("span", {}, label), output, input);
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { class: "field toggle" }, el("span", {}, label), input);
}

function modeSelect(count: number, value: number, label: string, onChange: (v: number) => void): HTMLSelectElement {
  const select = el("select");
  select.setAttribute("aria-label", label);
  for (let i = 0; i < count; i++) select.append(el("option", { value: String(i) }, t.modeOption(i + 1)));
  select.value = String(value);
  select.addEventListener("change", () => onChange(Number(select.value)));
  return select;
}

function summary(m: Mode): string {
  const type = t.cellTypes[m.cellType];
  const split = m.canSplit ? `→ ${m.childModes[0] + 1} + ${m.childModes[1] + 1}` : t.noSplit;
  return `${type} · ${split}`;
}

export class GenomeEditor {
  private genome!: Genome;
  private readonly openModes = new Set<number>([0]);
  private readonly preview: Preview;
  private readonly modesBox: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly startSelectBox: HTMLElement;
  private readonly addButton: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private readonly previewCells: HTMLElement;
  private previewTimer = 0;
  private toastTimer = 0;

  constructor(private readonly options: EditorOptions) {
    const { root } = options;
    root.replaceChildren();
    root.hidden = true;

    const canvas = el("canvas", { class: "preview-canvas" });
    canvas.setAttribute("aria-label", t.preview);
    this.previewCells = el("span");
    this.preview = new Preview(canvas, (cells) => {
      this.previewCells.textContent = t.previewCells(cells);
    });
    const restart = el("button", { type: "button", class: "small" }, t.restart);
    restart.addEventListener("click", () => this.preview.show(this.genome));

    const close = el("button", { type: "button", class: "small" }, t.close);
    close.addEventListener("click", () => this.close());

    this.nameInput = el("input", { type: "text", maxLength: GENOME_LIMITS.maxNameLength });
    this.nameInput.addEventListener("input", () => this.change(setName(this.genome, this.nameInput.value), false));

    const presetSelect = el("select");
    presetSelect.append(el("option", { value: "" }, "—"));
    for (const [id, g] of Object.entries(options.presets)) presetSelect.append(el("option", { value: id }, g.name));
    presetSelect.addEventListener("change", () => {
      const g = options.presets[presetSelect.value];
      presetSelect.value = "";
      if (!g) return;
      this.openModes.clear();
      this.openModes.add(0);
      this.change(g, true);
      this.nameInput.value = this.genome.name;
    });

    this.startSelectBox = el("label", { class: "field" });
    this.modesBox = el("div", { class: "modes" });
    this.addButton = el("button", { type: "button", class: "add" }, t.addMode);
    this.addButton.addEventListener("click", () => {
      this.openModes.add(this.genome.modes.length);
      this.change(addMode(this.genome), true);
    });

    const share = el("button", { type: "button" }, t.share);
    share.addEventListener("click", () => void this.share());
    const apply = el("button", { type: "button", class: "primary" }, t.apply);
    apply.addEventListener("click", () => {
      options.onApply(this.genome);
      this.close();
    });

    this.toast = el("p", { class: "toast" });
    this.toast.setAttribute("aria-live", "polite");

    root.append(
      el("header", { class: "editor-head" }, el("h2", {}, t.title), close),
      el(
        "div",
        { class: "editor-preview" },
        canvas,
        el("div", { class: "preview-bar" }, el("span", {}, t.previewShort, " · "), this.previewCells, restart),
      ),
      el(
        "div",
        { class: "editor-body" },
        el("p", { class: "help" }, t.help),
        el("label", { class: "field" }, el("span", {}, t.name), this.nameInput),
        el("label", { class: "field" }, el("span", {}, t.startFrom), presetSelect),
        this.startSelectBox,
        this.modesBox,
        this.addButton,
      ),
      el("footer", { class: "editor-actions" }, share, apply),
      this.toast,
    );
  }

  open(genome: Genome): void {
    this.openModes.clear();
    this.openModes.add(genome.startMode);
    this.options.root.hidden = false;
    document.body.classList.add("editing");
    this.change(genome, true);
    this.nameInput.value = this.genome.name;
  }

  close(): void {
    this.preview.stop();
    clearTimeout(this.previewTimer);
    this.options.root.hidden = true;
    document.body.classList.remove("editing");
  }

  /** Stores the new genome, redraws what is needed and refreshes the preview. */
  private change(next: Genome, rebuild: boolean): void {
    this.genome = canonical(next);
    if (rebuild) this.renderModes();
    else this.refreshSummaries();
    // Wait until the player stops dragging before restarting the preview.
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.preview.show(this.genome), rebuild ? 0 : 150);
  }

  private refreshSummaries(): void {
    this.genome.modes.forEach((m, i) => {
      const card = this.modesBox.children[i];
      if (!card) return;
      card.querySelector(".mode-summary")!.textContent = summary(m);
      card.querySelector(".chip")!.className = `chip type-${m.cellType}`;
    });
  }

  private renderModes(): void {
    const g = this.genome;
    this.startSelectBox.replaceChildren(
      el("span", {}, t.startMode),
      modeSelect(g.modes.length, g.startMode, t.startMode, (v) => this.change(setStartMode(this.genome, v), false)),
    );
    this.modesBox.replaceChildren(...g.modes.map((m, i) => this.modeCard(m, i)));
    this.addButton.hidden = g.modes.length >= GENOME_LIMITS.maxModes;
  }

  private modeCard(m: Mode, index: number): HTMLElement {
    const set = (patch: Partial<Mode>) => this.change(updateMode(this.genome, index, patch), false);
    const current = () => this.genome.modes[index];

    const card = el("details", { class: "mode", open: this.openModes.has(index) });
    card.addEventListener("toggle", () => {
      if (card.open) this.openModes.add(index);
      else this.openModes.delete(index);
    });

    card.append(
      el(
        "summary",
        {},
        el("span", { class: `chip type-${m.cellType}` }),
        el("strong", {}, t.mode(index + 1)),
        el("span", { class: "mode-summary" }, summary(m)),
      ),
    );

    // Cell type as a row of buttons.
    const types = el("div", { class: "segmented", role: "group" });
    types.setAttribute("aria-label", t.cellType);
    for (const type of CELL_TYPES) {
      const button = el("button", { type: "button" }, t.cellTypes[type as CellType]);
      button.setAttribute("aria-pressed", String(m.cellType === type));
      button.addEventListener("click", () => {
        for (const b of types.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === button));
        set({ cellType: type });
      });
      types.append(button);
    }

    const splitFields = el("div", { class: "split-fields" });
    splitFields.hidden = !m.canSplit;

    const daughter = (d: 0 | 1) => {
      const updatePair = <K extends "childModes" | "childTurns" | "childKeepsBonds">(key: K, value: Mode[K][0]) => {
        const pair = [...current()[key]] as Mode[K];
        pair[d] = value;
        set({ [key]: pair } as Partial<Mode>);
      };
      return el(
        "fieldset",
        { class: "daughter" },
        el("legend", {}, t.daughter(d + 1)),
        el(
          "label",
          { class: "field" },
          el("span", {}, t.childMode),
          modeSelect(this.genome.modes.length, m.childModes[d], t.childMode, (v) => updatePair("childModes", v)),
        ),
        slider(t.childTurn, Math.round(m.childTurns[d] * DEG), -180, 180, 15, t.degrees, (v) =>
          updatePair("childTurns", v / DEG),
        ),
        toggle(t.keepBonds, m.childKeepsBonds[d], (v) => updatePair("childKeepsBonds", v)),
      );
    };

    splitFields.append(
      slider(t.splitMass, m.splitMass, GENOME_LIMITS.minSplitMass, GENOME_LIMITS.maxSplitMass, 10, String, (v) =>
        set({ splitMass: v }),
      ),
      slider(t.splitAngle, Math.round(m.splitAngle * DEG), -180, 180, 15, t.degrees, (v) =>
        set({ splitAngle: v / DEG }),
      ),
      daughter(0),
      daughter(1),
      toggle(t.makeBond, m.makeBond, (v) => set({ makeBond: v })),
    );

    card.append(
      el("div", { class: "field" }, el("span", {}, t.cellType), types),
      toggle(t.canSplit, m.canSplit, (v) => {
        splitFields.hidden = !v;
        set({ canSplit: v });
      }),
      splitFields,
    );

    if (this.genome.modes.length > 1) {
      const remove = el("button", { type: "button", class: "remove" }, t.removeMode);
      remove.addEventListener("click", () => {
        this.openModes.clear();
        this.change(removeMode(this.genome, index), true);
      });
      card.append(remove);
    }
    return card;
  }

  private async share(): Promise<void> {
    const link = this.options.shareLink(this.genome);
    let message: string = t.copied;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      history.replaceState(null, "", link);
      message = t.copyFailed;
    }
    this.toast.textContent = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.textContent = ""), 3000);
  }
}
