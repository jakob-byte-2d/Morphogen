/**
 * Uniform spatial grid for fast neighbour lookups.
 *
 * Items are stored by index. Buckets keep insertion order, so queries always
 * return neighbours in the same order – important for determinism.
 */
export class SpatialGrid {
  readonly cellSize: number;
  private readonly cols: number;
  private readonly origin: number;
  private readonly buckets: number[][];

  /** Covers the square [-halfSize, halfSize] in both axes. */
  constructor(halfSize: number, cellSize: number) {
    this.cellSize = cellSize;
    this.origin = -halfSize;
    this.cols = Math.ceil((2 * halfSize) / cellSize) + 1;
    this.buckets = [];
    for (let i = 0; i < this.cols * this.cols; i++) this.buckets.push([]);
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
  }

  private col(v: number): number {
    const c = Math.floor((v - this.origin) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  insert(index: number, x: number, y: number): void {
    this.buckets[this.col(y) * this.cols + this.col(x)].push(index);
  }

  /** Calls fn for every item in buckets overlapping the box around (x, y). */
  query(x: number, y: number, radius: number, fn: (index: number) => void): void {
    const x0 = this.col(x - radius);
    const x1 = this.col(x + radius);
    const y0 = this.col(y - radius);
    const y1 = this.col(y + radius);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
