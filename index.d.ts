/** CSS color string (any syntax the browser parses, oklch included) or [r, g, b, a?] with channels 0..1 */
export type Color = string | ArrayLike<number>

export interface Options {
  /** Mono samples; replaces all data. A Float32Array is referenced, not copied; other array-likes are converted. */
  data?: ArrayLike<number> | null
  /** Visible [from, to] in samples; fractional, may extend past the data. null: [0, length]. */
  range?: [number, number] | null
  /** [min, max] value mapped to the viewport's bottom..top; [1, -1] flips. null: [-1, 1]. */
  amplitude?: [number, number] | null
  /** [x, y, width, height] in CSS px, top-left origin. null: the whole canvas. */
  viewport?: [number, number, number, number] | null
  /** Envelope and line color. null: default blue. */
  color?: Color | null
  /** RMS band color; false hides the band; null or true: color, lightened. */
  rms?: Color | boolean | null
  /** Zoomed out, shade the fill by how often the signal reaches each level, in place of the RMS band. null: false. */
  density?: boolean | null
  /** Line width in CSS px, at least one device pixel. null: 1. */
  thickness?: number | null
  /** Device px per CSS px. null: devicePixelRatio. */
  pixelRatio?: number | null
}

export interface Column {
  /** First sample index of the column */
  from: number
  /** One past the last sample index */
  to: number
  /** Exact extremes of the column's samples, NaN excluded */
  min: number
  max: number
  /** sqrt(mean(x²)) over the column's samples, NaN excluded */
  rms: number
}

export default class Waveform {
  /** A canvas (its WebGL2 context is created or reused) or a WebGL2 context shared with other waveforms */
  constructor(target: HTMLCanvasElement | OffscreenCanvas | WebGL2RenderingContext, options?: Options)
  readonly gl: WebGL2RenderingContext
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  /** Number of samples */
  readonly length: number
  /** Resolved visible range */
  readonly range: [number, number]
  readonly amplitude: [number, number]
  /** Change any option; undefined keeps, null restores the default */
  update(options: Options): this
  /** Append samples */
  push(samples: ArrayLike<number>): this
  /** Write samples at offset, extending the data if needed; a gap before offset reads as NaN */
  set(samples: ArrayLike<number>, offset?: number): this
  /** Draw into the viewport, over what is there */
  render(): this
  /** Clear the viewport to transparent */
  clear(): this
  /**
   * The column at x CSS px from the viewport's left. Zoomed out: the samples it holds and their stats.
   * Zoomed in (a sample or less per device px): the sample nearest to the column's center. null over gaps.
   */
  pick(x: number): Column | null
  /** Release the GPU texture, the data and the event listeners */
  destroy(): void
}
