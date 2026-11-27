import { H, W } from "../sim/dims";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;

/**
 * What part of the glass is on screen. The glass element always has the
 * world's shape, so at zoom 1 the whole world fits exactly.
 */
export class Camera {
  zoom = 1;
  /** World point (in cells) at the centre of the view. */
  cx = W / 2;
  cy = H / 2;
  /** Size of the glass element in CSS pixels. */
  width = W;
  height = H;
  private target: { zoom: number; cx: number; cy: number } | null = null;

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.clamp();
  }

  /** CSS pixels per cell. */
  get scale(): number {
    return (this.width / W) * this.zoom;
  }

  /** Where the world's top-left corner is, in CSS pixels. */
  get offsetX(): number {
    return this.width / 2 - this.cx * this.scale;
  }

  get offsetY(): number {
    return this.height / 2 - this.cy * this.scale;
  }

  toCell(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor((px - this.offsetX) / this.scale), y: Math.floor((py - this.offsetY) / this.scale) };
  }

  /** Zooms by factor, keeping the point under (px, py) where it is. */
  zoomAt(px: number, py: number, factor: number): void {
    this.target = null;
    const wx = (px - this.offsetX) / this.scale;
    const wy = (py - this.offsetY) / this.scale;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const s = this.scale;
    this.cx = (this.width / 2 - (px - wx * s)) / s;
    this.cy = (this.height / 2 - (py - wy * s)) / s;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.target = null;
    this.cx -= dx / this.scale;
    this.cy -= dy / this.scale;
    this.clamp();
  }

  /** Double tap: zoom in on the point, or back out if already zoomed in. */
  toggleZoom(px: number, py: number): void {
    if (this.zoom > 1.5) {
      this.target = { zoom: 1, cx: W / 2, cy: H / 2 };
    } else {
      const wx = (px - this.offsetX) / this.scale;
      const wy = (py - this.offsetY) / this.scale;
      this.target = { zoom: 4, cx: wx, cy: wy };
    }
  }

  /** Eases towards a double-tap target. Returns true while moving. */
  update(dt: number): boolean {
    if (!this.target) return false;
    const k = 1 - Math.exp(-dt * 12);
    this.zoom += (this.target.zoom - this.zoom) * k;
    this.cx += (this.target.cx - this.cx) * k;
    this.cy += (this.target.cy - this.cy) * k;
    if (Math.abs(this.target.zoom - this.zoom) < 0.01) {
      this.zoom = this.target.zoom;
      this.target = null;
    }
    this.clamp();
    return true;
  }

  private clamp(): void {
    const s = this.scale;
    const halfW = this.width / 2 / s;
    const halfH = this.height / 2 / s;
    this.cx = Math.min(W - halfW, Math.max(halfW, this.cx));
    this.cy = Math.min(H - halfH, Math.max(halfH, this.cy));
  }
}
