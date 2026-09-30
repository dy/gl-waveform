// Browser side of the tests: a brute-force reference for pick(), and pixel probes over gl.readPixels
import Waveform from '../index.js'

// Seeded PRNG (mulberry32), so failures reproduce
export const random = seed => () => {
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

export function canvas(w, h) {
  let c = document.createElement('canvas')
  c.width = w; c.height = h
  document.body.append(c)
  return c
}

// ── statistics ──────────────────────────────────────────────────────────

// What pick() promises for device column c of a W px wide view: samples per px spp = (to - from) / W; above 1 the
// column holds samples [edge(c), edge(c+1)), edge(c) = ceil((q+c)·spp) with q = floor(from / spp), rounded to a
// multiple of 256 from 1024 samples per px on, and reports their exact min, max and RMS over non-NaN samples; at or
// below 1 it reports the sample nearest the column center.
export function reference(get, n, [r0, r1], W, c) {
  let spp = (r1 - r0) / W
  if (!(spp > 0 && spp < Infinity)) return null
  if (spp <= 1) {
    let k = Math.round(r0 + (c + .5) * spp), v = k >= 0 && k < n ? get(k) : NaN
    return Number.isNaN(v) ? null : { from: k, to: k + 1, min: v, max: v, rms: Math.abs(v) }
  }
  let q = Math.floor(r0 / spp), edge = c => spp >= 1024 ? Math.round(Math.ceil((q + c) * spp) / 256) * 256 : Math.ceil((q + c) * spp)
  let from = Math.max(edge(c), 0), to = Math.min(edge(c + 1), n)
  let min = Infinity, max = -Infinity, sum = 0, count = 0
  for (let i = from; i < to; i++) {
    let v = get(i)
    if (Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v * v
    count++
  }
  return count ? { from, to, min, max, rms: Math.sqrt(sum / count) } : null
}

const same = (a, b) => !a || !b ? a === b :
  a.from === b.from && a.to === b.to && a.min === b.min && a.max === b.max &&
  (a.rms === b.rms || Math.abs(a.rms - b.rms) <= 1e-6 * Math.abs(b.rms))

// Every column of wf against the reference
export function compare(wf, get, W, pr) {
  let bad = [], n = wf.length, range = wf.range
  for (let c = 0; c < W; c++) {
    let got = wf.pick((c + .5) / pr), want = reference(get, n, range, W, c)
    if (!same(got, want)) bad.push({ c, range, got, want })
  }
  return bad
}

// Uniform noise in ±1, some samples beyond ±1, NaN runs up to ~70k long, scattered ±Infinity
export function noise(n, r, { nan = 0, inf = 0 } = {}) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * (r() < .01 ? 3 : 1)
  for (let k = 0; k < nan; k++) { let a = Math.floor(r() * n); d.fill(NaN, a, a + Math.floor(r() ** 3 * 7e4)) }
  for (let k = 0; k < inf; k++) d[Math.floor(r() * n)] = r() < .5 ? Infinity : -Infinity
  return d
}

// A random view W px wide: 1e-3..1e5 samples per px, log-uniform, starting anywhere from before the data to past it
export function view(r, n, W) {
  let spp = 10 ** (r() * 8 - 3), from = (r() * 1.4 - .2) * Math.max(n, 1) + r() * 10 - 5
  return [from, from + spp * W]
}

// Fixed data, many views
export function views({ seed, n, nan, inf, count, W, pr }) {
  let r = random(seed), d = noise(n, r, { nan, inf }), wf = new Waveform(canvas(W, 8), { pixelRatio: pr, data: d })
  let bad = [], cols = 0
  for (let k = 0; k < count; k++) {
    wf.update({ range: view(r, n, W) })
    bad.push(...compare(wf, i => d[i], W, pr))
    cols += W
  }
  wf.update({ range: null })
  bad.push(...compare(wf, i => d[i], W, pr))
  wf.canvas.remove()
  return { cols: cols + W, bad: bad.slice(0, 3), nbad: bad.length }
}

// Data built by push() and set(), including writes past the end, checked against a plain array kept alongside
export function edits({ seed, steps, W, pr }) {
  let r = random(seed), wf = new Waveform(canvas(W, 8), { pixelRatio: pr }), ref = new Float32Array(0), n = 0
  let put = (s, at) => {
    if (at + s.length > ref.length) { let g = new Float32Array(Math.max(at + s.length, ref.length * 2)).fill(NaN); g.set(ref.subarray(0, n)); ref = g }
    ref.set(s, at); n = Math.max(n, at + s.length)
  }
  let bad = [], cols = 0
  for (let k = 0; k < steps; k++) {
    let s = noise(Math.floor(r() ** 2 * 7e4) + 1, r, { nan: r() < .2 ? 1 : 0, inf: r() < .1 ? 2 : 0 })
    let op = r()
    if (op < .5) { put(s, n); wf.push(s) }
    else if (op < .8) { let at = Math.floor(r() * n); put(s, at); wf.set(s, at) }
    else { let at = n + Math.floor(r() * 3e5); put(s, at); wf.set(Array.from(s), at) }
    if (wf.length !== n) return { cols, bad: [{ length: wf.length, expected: n }], nbad: 1 }
    for (let v = 0; v < 3; v++) {
      wf.update({ range: v ? view(r, n, W) : null })
      bad.push(...compare(wf, i => ref[i], W, pr))
      cols += W
    }
  }
  wf.canvas.remove()
  return { cols, bad: bad.slice(0, 3), nbad: bad.length }
}

// Samples at ~1e9: a 3000-sample island after a NaN gap, viewed from far out down to 1e-3 samples per px
export function far({ seed, W, pr }) {
  let r = random(seed), at = 1e9 - 1000, s = noise(3000, r, { inf: 3 }), wf = new Waveform(canvas(W, 8), { pixelRatio: pr })
  wf.set(s, at)
  let get = i => i >= at && i < at + s.length ? s[i - at] : NaN, bad = [], cols = 0
  for (let k = 0; k < 60; k++) {
    let spp = 10 ** (r() * 6 - 3), from = at - 200 + r() * 3200 - spp * W / 2
    wf.update({ range: [from, from + spp * W] })
    bad.push(...compare(wf, get, W, pr))
    cols += W
  }
  for (let range of [null, [at - 1, at + 1], [at + 0.5, at + 0.5 + W * 1e-3]]) {
    wf.update({ range })
    bad.push(...compare(wf, get, W, pr))
    cols += W
  }
  let length = wf.length
  wf.canvas.remove()
  return { cols, length, bad: bad.slice(0, 3), nbad: bad.length }
}

// ── pixels ──────────────────────────────────────────────────────────────

// Drawing buffer as rows from the top: [r, g, b, a] at (x, y) is at 4·(y·w + x)
export function read(gl) {
  let w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, raw = new Uint8Array(w * h * 4), img = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw)
  for (let y = 0; y < h; y++) img.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
  return { w, h, img, a: (x, y) => img[4 * (y * w + x) + 3], px: (x, y) => [...img.subarray(4 * (y * w + x), 4 * (y * w + x) + 4)] }
}

// Covered rows (alpha > 0) of column x: [top, bottom] or null
const span = (p, x, y0 = 0, y1 = p.h) => {
  let top = -1, bot = -1
  for (let y = y0; y < y1; y++) if (p.a(x, y)) { if (top < 0) top = y; bot = y }
  return top < 0 ? null : [top, bot]
}

// One sample of 1 in 10M zeros, fully zoomed out
export function spike() {
  let n = 1e7, k = 6543210, d = new Float32Array(n), wf = new Waveform(canvas(400, 100), { pixelRatio: 1 })
  d[k] = 1
  wf.update({ data: d }).render()
  let p = read(wf.gl), col = -1, others = 0
  for (let c = 0; c < 400; c++) { let s = wf.pick(c + .5); if (s.from <= k && k < s.to) col = c }
  for (let c = 0; c < 400; c++) if (Math.abs(c - col) > 2) { let s = span(p, c); if (s[0] < 48) others++ }
  let res = { col, spike: span(p, col), others, pick: wf.pick(col + .5) }
  wf.canvas.remove()
  return res
}

// A sine at .8 zoomed out, with and without density: alpha on the zero line and at 90 % of the peak; a square wave's
// the same way. Density shades a level by S = 1 − (|v| / P)^k, k = 2q / (1 − q), q = RMS² / peak² (index.js), shown
// as mix(.3, 1, S): a sine's q = 1/2 gives S(.9 P) = .19, drawn at .43; a square's q, capped at .98, keeps S near 1.
export function density() {
  let n = 1e5, sine = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 2 * Math.PI / 200) * .8)
  let square = Float32Array.from({ length: n }, (_, i) => (i % 200 < 100 ? .8 : -.8))
  let wf = new Waveform(canvas(400, 101), { pixelRatio: 1, color: [1, 1, 1, 1], rms: false }), out = {}
  // the zero line is row 50; .9 of .8 is 36 rows up
  for (let [name, data, dense] of [['plain', sine, false], ['sine', sine, true], ['square', square, true]]) {
    wf.clear().update({ data, density: dense }).render()
    let p = read(wf.gl)
    out[name] = { zero: p.a(200, 50), high: p.a(200, 14) }
  }
  wf.canvas.remove()
  return out
}

// A sine at 40 px per sample: the line passes through every column where the samples say, nothing far from it is drawn
export function line() {
  let d = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i * 2 * Math.PI / 64) * .8)
  let wf = new Waveform(canvas(400, 100), { pixelRatio: 1, data: d, range: [100.25, 110.25] })
  wf.render()
  let p = read(wf.gl), miss = [], stray = 0
  for (let x = 0; x < 400; x++) {
    let s = 100.25 + (x + .5) / 40, i = Math.floor(s), v = d[i] + (s - i) * (d[i + 1] - d[i])
    let y = 99 - Math.floor(50.5 + v * 50)  // row holding the line; 50.5 is the midline, on a pixel center for a 1 px line
    if (p.a(x, y) < 128) miss.push([x, y, p.a(x, y)])
    for (let r = 0; r < 100; r++) if (Math.abs(r - y) > 5 && p.a(x, r)) stray++
  }
  let dots = 0 // sample points are dots of 2 px radius: covered 2 px above and below, where a 1 px line is not
  for (let k = 101; k <= 109; k++) { let x = Math.floor((k - 100.25) * 40), y = 99 - Math.floor(50.5 + d[k] * 50); if (p.a(x, y - 2) && p.a(x, y + 2)) dots++ }
  wf.canvas.remove()
  return { miss: miss.slice(0, 5), nmiss: miss.length, stray, dots }
}

// Two lanes on one canvas and one context: neither draws or clears outside its viewport; one program serves both
export function lanes() {
  let c = canvas(300, 200), r = random(7), gl = c.getContext('webgl2', { preserveDrawingBuffer: true }), programs = 0, create = gl.createProgram
  gl.createProgram = () => (programs++, create.call(gl))
  let a = new Waveform(c, { pixelRatio: 1, viewport: [0, 0, 300, 100], data: noise(5e4, r).map(v => v * 4), thickness: 4 })
  let b = new Waveform(a.gl, { pixelRatio: 1, viewport: [0, 100, 300, 100], data: noise(5e4, r).map(v => v * 4), thickness: 4 })
  let ink = (p, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 300; x++) s += p.a(x, y) > 0; return s }
  let eq = (p, q, y0, y1) => p.img.subarray(y0 * 1200, y1 * 1200).every((v, i) => v === q.img[y0 * 1200 + i])
  a.render()
  let p1 = read(a.gl)
  b.render()
  let p2 = read(a.gl)
  a.clear()
  let p3 = read(a.gl)
  let res = {
    aInk: ink(p1, 0, 100), bleedA: ink(p1, 100, 200), bInk: ink(p2, 100, 200),
    aKept: eq(p1, p2, 0, 100), aCleared: ink(p3, 0, 100), bKept: eq(p2, p3, 100, 200), programs
  }
  c.remove()
  return res
}

// Zoomed-out sine on a transparent canvas: nothing outside the envelope, opaque inside, premultiplied everywhere
export function transparent() {
  let d = Float32Array.from({ length: 1e5 }, (_, i) => Math.sin(i * 2 * Math.PI / 200) * .5)
  let wf = new Waveform(canvas(400, 100), { pixelRatio: 1, data: d, color: [1, .5, 0, 1] })
  wf.render()
  let p = read(wf.gl), outside = 0, inside = 0, notOpaque = 0, notPremul = 0
  for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) {
    let [R, G, B, A] = p.px(x, y)
    if (R > A || G > A || B > A) notPremul++
    if (y < 24 || y > 76) outside += A > 0 // envelope rows 25..75 (±0.5 around 50.5), stroke adds half a pixel
    else if (y > 26 && y < 74) { inside++; notOpaque += A !== 255 }
  }
  // a half-transparent color composites to half alpha
  wf.clear().update({ color: [1, .5, 0, .5], rms: false }).render()
  let half = read(wf.gl).px(200, 50)
  wf.canvas.remove()
  return { outside, inside, notOpaque, notPremul, half }
}

// A steep ramp at 1.5 samples per px: 1–2 samples per column, yet neighbouring columns always connect
export function joined() {
  let d = Float32Array.from({ length: 4000 }, (_, i) => Math.abs((i % 40) / 20 - 1) * 1.8 - .9)
  let wf = new Waveform(canvas(400, 100), { pixelRatio: 1, data: d, range: [0, 600] })
  wf.render()
  let p = read(wf.gl), gaps = []
  for (let x = 0; x < 399; x++) {
    let s = span(p, x), t = span(p, x + 1)
    if (!s || !t || s[1] + 1 < t[0] || t[1] + 1 < s[0]) gaps.push([x, s, t])
  }
  wf.canvas.remove()
  return { gaps: gaps.slice(0, 5), ngaps: gaps.length }
}

// A sine just above (envelope) and just below (line) one sample per px: same peaks, same ink per sample
export function transition() {
  let d = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i * 2 * Math.PI / 50) * .8)
  let wf = new Waveform(canvas(400, 100), { pixelRatio: 1, data: d })
  let look = spp => {
    wf.clear().update({ range: [1000, 1000 + 400 * spp] }).render()
    let p = read(wf.gl), ink = 0, top = 100, bot = 0
    for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) { let a = p.a(x, y); ink += a / 255; if (a > 127) top = Math.min(top, y), bot = Math.max(bot, y) }
    return { ink: ink / (400 * spp), top, bot }
  }
  let res = { above: look(1.005), below: look(0.995) }
  wf.canvas.remove()
  return res
}

// NaN runs are gaps; ±Infinity reaches the viewport edge without disturbing the neighbours
export function gaps() {
  let d = Float32Array.from({ length: 4e4 }, (_, i) => Math.sin(i / 30) * .3)
  d.fill(NaN, 16000, 24000)
  d[6000] = Infinity; d[34000] = -Infinity
  let wf = new Waveform(canvas(400, 100), { pixelRatio: 1, data: d })
  wf.render()
  let p = read(wf.gl), inGap = 0, col = k => { for (let c = 0; c < 400; c++) { let s = wf.pick(c + .5); if (s && s.from <= k && k < s.to) return c } }
  for (let x = 162; x < 238; x++) inGap += span(p, x) != null
  let up = col(6000), down = col(34000)
  let res = { inGap, gapPick: wf.pick(200), up: span(p, up), down: span(p, down), beside: [span(p, up - 3), span(p, down + 3)], upPick: wf.pick(up + .5) }
  wf.canvas.remove()
  return res
}

// CSS colors, oklch included, come out as a 2D canvas draws them; bad colors throw
export function colors() {
  let wf = new Waveform(canvas(20, 20), { pixelRatio: 1, data: new Float32Array(100), thickness: 20 }), out = {}
  for (let color of ['oklch(0.7 0.15 250)', 'rebeccapurple', '#0f08']) {
    wf.clear().update({ color, rms: false }).render()
    let ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
    let [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    out[color] = { gl: read(wf.gl).px(10, 10), css: [r * a / 255, g * a / 255, b * a / 255, a].map(Math.round) }
  }
  try { wf.update({ color: 'not-a-color' }); out.invalid = 'accepted' } catch (e) { out.invalid = e.message }
  wf.canvas.remove()
  return out
}

// Losing the context throws nowhere; on restore the waveform draws itself again
export async function lose() {
  let c = canvas(200, 50), wf = new Waveform(c, { pixelRatio: 1, data: Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 9)) })
  let ext = wf.gl.getExtension('WEBGL_lose_context'), errors = []
  wf.render()
  let on = type => new Promise((res, rej) => { c.addEventListener(type, res, { once: true }); setTimeout(() => rej(Error(type + ' never fired')), 5000) })
  let lost = on('webglcontextlost')
  ext.loseContext()
  await lost
  await new Promise(res => setTimeout(res)) // restoring is allowed once the lost event has been fully dispatched
  for (let call of [() => wf.update({ range: [0, 500] }), () => wf.push([.5, .5]), () => wf.render(), () => wf.clear(), () => wf.pick(10), () => wf.set([1], 3)])
    try { call() } catch (e) { errors.push(e.message) }
  let restored = on('webglcontextrestored')
  ext.restoreContext()
  await restored
  await new Promise(res => setTimeout(res))
  let p = read(wf.gl), ink = 0
  for (let y = 0; y < 50; y++) for (let x = 0; x < 200; x++) ink += p.a(x, y) > 0
  c.remove()
  return { errors, ink, length: wf.length }
}

// Constructor and option errors, getters, the default range following push(), data referenced not copied, destroy()
export function api() {
  let out = { errors: {} }, c2d = canvas(10, 10)
  c2d.getContext('2d')
  try { new Waveform(c2d); out.ctor = 'accepted' } catch (e) { out.ctor = e.name }
  let d = new Float32Array(7e4), wf = new Waveform(canvas(100, 20), { pixelRatio: 1, data: d }) // a full chunk and a partial one
  for (let o of [{ range: [0, NaN] }, { amplitude: 1 }, { viewport: [0, 0, 10] }, { thickness: 'x' }, { pixelRatio: 'x' }])
    try { wf.update(o); out.errors[Object.keys(o)[0]] = 'accepted' } catch (e) { out.errors[Object.keys(o)[0]] = e.name }
  try { wf.set([1], -1); out.offset = 'accepted' } catch (e) { out.offset = e.name }
  wf.push([1, 2, 3])
  out.length = wf.length
  out.range = wf.range
  wf.set([5], 3)
  out.shared = [d[3], wf.update({ range: [0, 13] }).pick(23.5)?.max]
  wf.update({ range: [2, 4], amplitude: [1, -1] })
  out.getters = [wf.range, wf.amplitude]
  wf.update({ range: null, amplitude: null })
  out.defaults = [wf.range, wf.amplitude]
  wf.destroy()
  wf.render()
  let p = read(wf.gl), ink = 0
  for (let i = 3; i < p.img.length; i += 4) ink += p.img[i] > 0
  out.afterDestroy = [wf.length, ink]
  wf.canvas.remove(); c2d.remove()
  return out
}

// With the default viewport, a resized canvas is filled on the next render without an update()
export function resize() {
  let c = canvas(200, 50), wf = new Waveform(c, { pixelRatio: 1, data: Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i / 7) * .5) })
  let right = () => { let p = read(wf.gl), s = 0; for (let y = 0; y < p.h; y++) for (let x = p.w / 2; x < p.w; x++) s += p.a(x, y) > 0; return s }
  wf.render()
  let before = right()
  c.width = 400
  wf.render()
  let after = right()
  c.remove()
  return { before, after }
}

// The same samples at offset 1e9 and at offset 1000 draw the same pixels, across sub-sample pans at deep zoom
export function farPixels() {
  let r = random(41), s = noise(3000, r).map(v => v * .8), D = 1e9 - 2000, worst = 0, frames = 0, ink = 0
  let near = new Waveform(canvas(400, 100), { pixelRatio: 1 }), far = new Waveform(canvas(400, 100), { pixelRatio: 1 })
  near.set(s, 1000); far.set(s, 1000 + D)
  for (let spp of [.5, .05, .005]) for (let k = 0; k < 8; k++) {
    let from = 2100 + k * .137
    let a = read(near.clear().update({ range: [from, from + 400 * spp] }).render().gl).img
    let b = read(far.clear().update({ range: [from + D, from + D + 400 * spp] }).render().gl).img
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
    for (let i = 3; i < a.length; i += 4) ink += a[i] > 0
    frames++
  }
  near.canvas.remove(); far.canvas.remove()
  return { worst, frames, ink }
}
