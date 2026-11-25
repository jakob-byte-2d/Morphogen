import type { Camera } from "../view/camera";

export interface ToolHandlers {
  start(x: number, y: number): void;
  move(x: number, y: number): void;
  end(): void;
}

/**
 * Touch and mouse on the glass. One finger uses the tool; two fingers pinch
 * to zoom and drag to move around; a double tap zooms in or out. The mouse
 * wheel zooms too.
 */
export function attachInput(el: HTMLElement, camera: Camera, tool: ToolHandlers, onRing: (x: number, y: number, on: boolean) => void): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let tooling = false;
  let pinch: { dist: number; mx: number; my: number } | null = null;
  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  let lastTap = { time: -1e9, x: 0, y: 0 };

  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const stopTool = () => {
    if (tooling) tool.end();
    tooling = false;
    onRing(0, 0, false);
  };

  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const now = performance.now();
      downAt = now;
      downPos = p;
      if (now - lastTap.time < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        lastTap.time = -1e9;
        camera.toggleZoom(p.x, p.y);
        return;
      }
      const c = camera.toCell(p.x, p.y);
      tooling = true;
      tool.start(c.x, c.y);
      onRing(p.x, p.y, true);
    } else if (pointers.size === 2) {
      stopTool();
      pinch = pinchState();
    }
  });

  el.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1 && tooling) {
      const c = camera.toCell(p.x, p.y);
      tool.move(c.x, c.y);
      onRing(p.x, p.y, true);
    } else if (pointers.size >= 2 && pinch) {
      const now = pinchState();
      if (pinch.dist > 0) camera.zoomAt(now.mx, now.my, now.dist / pinch.dist);
      camera.pan(now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
    }
  });

  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      const p = local(e);
      const quick = performance.now() - downAt < 250 && Math.hypot(p.x - downPos.x, p.y - downPos.y) < 12;
      if (tooling && quick) lastTap = { time: performance.now(), x: p.x, y: p.y };
      stopTool();
    }
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = local(e);
      camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
}
