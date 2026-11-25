import { t } from "./strings";

export interface DevState {
  speed: number;
  max: boolean;
  paused: boolean;
  stepOnce: boolean;
}

/** Developer panel: speed, pause, single steps and a few numbers. Opened with ?dev. */
export class DevPanel {
  readonly el = document.createElement("div");
  private info = document.createElement("div");
  private pauseButton = document.createElement("button");

  constructor(private state: DevState) {
    this.el.className = "dev";
    this.pauseButton.type = "button";
    this.pauseButton.addEventListener("click", () => {
      state.paused = !state.paused;
      this.refresh();
    });
    const stepButton = this.button(t.dev.step, () => {
      state.paused = true;
      state.stepOnce = true;
      this.refresh();
    });
    stepButton.textContent = "+1";
    this.el.append(this.pauseButton, stepButton);
    for (const s of [1, 10, 100, 0]) {
      const b = this.button(s === 0 ? t.dev.max : `${s}×`, () => {
        state.max = s === 0;
        state.speed = s || state.speed;
        state.paused = false;
        this.refresh();
      });
      b.dataset.speed = String(s);
      this.el.append(b);
    }
    this.info.className = "dev-info";
    this.el.append(this.info);
    this.refresh();
  }

  private button(label: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", fn);
    return b;
  }

  refresh(): void {
    this.pauseButton.textContent = this.state.paused ? "▶" : "⏸";
    this.pauseButton.setAttribute("aria-label", this.state.paused ? t.dev.play : t.dev.pause);
    for (const b of this.el.querySelectorAll<HTMLButtonElement>("button[data-speed]")) {
      const s = Number(b.dataset.speed);
      b.setAttribute("aria-pressed", String(s === 0 ? this.state.max : !this.state.max && s === this.state.speed));
    }
  }

  setInfo(tick: number, fps: number, ms: number, tps: number): void {
    this.info.textContent = t.dev.info(tick, fps, ms, tps);
  }
}
