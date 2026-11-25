/**
 * Uniform spatial grid for fast neighbour lookups.
 *
 * Items are stored by index. Buckets keep insertion order, so queries always
 * return neighbours in the same order – important for determinism.
 */
export class SpatialGrid {
  readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: number[][];

  /** Covers the rectangle [0, width] × [0, height]. */
  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.buckets = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.buckets.push([]);
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
  }

  private col(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor(y / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  insert(index: number, x: number, y: number): void {
    this.buckets[this.row(y) * this.cols + this.col(x)].push(index);
  }

  /** Calls fn for every item in buckets overlapping the box around (x, y). */
  query(x: number, y: number, radius: number, fn: (index: number) => void): void {
    const x0 = this.col(x - radius);
    const x1 = this.col(x + radius);
    const y0 = this.row(y - radius);
    const y1 = this.row(y + radius);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
