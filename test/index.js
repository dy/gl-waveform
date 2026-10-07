// npm test: headless Chromium (SwiftShader WebGL2, deterministic), node:test runner
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { open } from './browser.js'

let browser, page
before(async () => ({ browser, page } = await open()))
after(() => browser?.close())

// Run an export of test/page.js in the browser
const run = (name, arg) => page.evaluate(async ([name, arg]) => (await import('/test/page.js'))[name](arg), [name, arg])

const clean = (res, what) => assert.equal(res.nbad, 0, `${res.nbad} of ${res.cols} ${what} differ from the reference, e.g. ${JSON.stringify(res.bad)}`)

// ── statistics: pick() per column vs brute force over the samples ─────

test('columns: random data, 1e-3..1e5 samples per px, ranges before/after/beyond data', async () => {
  for (let [seed, n, W, pr] of [[1, 1e6 + 3, 640, 1], [2, 65536 + 17, 333, 1.5], [3, 257, 97, 2], [4, 1e5, 1024, 1]]) {
    clean(await run('views', { seed, n, W, pr, count: 40 }), 'columns')
  }
})

test('columns: NaN runs and ±Infinity', async () => {
  for (let [seed, n, W] of [[5, 1e6, 500], [6, 3e5, 211], [7, 7e4, 64]]) {
    clean(await run('views', { seed, n, W, pr: 1, nan: 12, inf: 20, count: 40 }), 'columns')
  }
})

test('columns: empty, 1, 2 and 3 samples', async () => {
  for (let n of [0, 1, 2, 3]) clean(await run('views', { seed: 10 + n, n, W: 50, pr: 1, count: 30 }), 'columns')
})

test('columns: data built by push(), set() over it and set() past the end', async () => {
  for (let seed of [21, 22, 23]) clean(await run('edits', { seed, steps: 40, W: 300, pr: 1 }), 'columns')
})

test('columns: samples held only as peaks, some chunks set and dropped: exact zoomed out, and zoomed in where held', async () => {
  for (let [seed, n, W, pr] of [[41, 1e6 + 3, 640, 1], [42, 3e5 + 77, 333, 1.5], [43, 65536 * 5, 500, 2]]) {
    clean(await run('peaked', { seed, n, W, pr, count: 40 }), 'columns')
  }
})

test('columns: samples at offset 1e9, from 1e6 down to 1e-3 samples per px', async () => {
  let res = await run('far', { seed: 31, W: 400, pr: 2 })
  assert.equal(res.length, 1e9 + 2000)
  clean(res, 'columns')
})

// ── pixels ───────────────────────────────────────────────────────────

test('render: at offset 1e9 the line draws as at offset 1000, through sub-sample pans', async () => {
  let r = await run('farPixels')
  assert.ok(r.ink > 1000, 'something is drawn')
  assert.ok(r.worst <= 1, `max channel difference over ${r.frames} frames: ${r.worst}`)
})

test('render: a single-sample spike in 10M samples reaches full height at full zoom-out', async () => {
  let { col, spike, others, pick } = await run('spike')
  assert.ok(col >= 0, 'the spike sits in a column')
  assert.equal(pick.max, 1)
  assert.deepEqual(spike, [0, 49], 'spike column covers from the top row to the zero line')
  assert.equal(others, 0, 'no other column rises above the zero line')
})

test('render: deep zoom draws the line through the samples, with dots', async () => {
  let { nmiss, miss, stray, dots } = await run('line')
  assert.equal(nmiss, 0, `line missing at ${JSON.stringify(miss)}`)
  assert.equal(stray, 0, 'no pixels far from the line')
  assert.equal(dots, 9, 'a dot at each visible sample')
})

test('render: lanes sharing a canvas stay inside their viewports', async () => {
  let r = await run('lanes')
  assert.ok(r.aInk > 1000 && r.bInk > 1000, 'both lanes draw')
  assert.equal(r.bleedA, 0, 'lane A does not draw outside its viewport')
  assert.ok(r.aKept, 'drawing lane B leaves lane A untouched')
  assert.equal(r.aCleared, 0, 'clear() empties lane A')
  assert.ok(r.bKept, 'clearing lane A leaves lane B untouched')
  assert.equal(r.programs, 1, 'one shader program per context')
})

test('render: the default viewport follows a resized canvas', async () => {
  let r = await run('resize')
  assert.ok(r.before > 0 && r.after > 0, `drawn in the new right half: ${JSON.stringify(r)}`)
})

test('render: transparent outside the envelope, opaque inside, premultiplied', async () => {
  let r = await run('transparent')
  assert.equal(r.outside, 0, 'pixels outside the envelope stay transparent')
  assert.ok(r.inside > 10000)
  assert.equal(r.notOpaque, 0, 'the envelope is opaque')
  assert.equal(r.notPremul, 0, 'color never exceeds alpha')
  assert.deepEqual(r.half.map(v => Math.round(v / 4)), [32, 16, 0, 32], 'half-transparent color composites to half alpha')
})

test('render: neighbouring columns connect, even with 1–2 samples per column', async () => {
  let r = await run('joined')
  assert.equal(r.ngaps, 0, `gaps between columns: ${JSON.stringify(r.gaps)}`)
})

test('render: crossing one sample per px keeps peaks and ink per sample', async () => {
  let { above, below } = await run('transition')
  assert.ok(Math.abs(above.top - below.top) <= 1 && Math.abs(above.bot - below.bot) <= 1, `peaks: ${JSON.stringify({ above, below })}`)
  assert.ok(Math.abs(above.ink / below.ink - 1) < .02, `ink per sample: ${above.ink} vs ${below.ink}`)
})

test('render: density shades the fill by how often noise of the column\'s RMS is at each level, Gaussian or Laplace', async () => {
  let { plain, sine, square, laplace, invalid } = await run('density')
  assert.deepEqual([plain.zero, plain.high], [255, 255], 'without density the envelope is solid')
  assert.equal(sine.zero, 255, 'on the axis: full')
  // at .9 of the peak P, rms P/√2 for the sine, P for the square
  const gauss = rms => .1 + .9 * Math.exp(-.5 * (.9 / rms) ** 2), lap = rms => Math.exp(-Math.SQRT2 * .9 / rms)
  assert.ok(Math.abs(sine.high / 255 - gauss(Math.SQRT1_2)) < .03, `Gaussian, a sine at 90 % of its peak: ${sine.high} (${gauss(Math.SQRT1_2).toFixed(3)} of 255)`)
  assert.ok(Math.abs(square.high / 255 - gauss(1)) < .03, `Gaussian, a square at 90 % of its peak: ${square.high} (${gauss(1).toFixed(3)} of 255)`)
  assert.ok(Math.abs(laplace.high / 255 - lap(Math.SQRT1_2)) < .03, `Laplace, a sine at 90 % of its peak: ${laplace.high} (${lap(Math.SQRT1_2).toFixed(3)} of 255)`)
  assert.equal(laplace.zero, 255)
  assert.equal(invalid, 'TypeError', 'an unknown density throws')
})

test('render: the RMS band in the line color, the envelope lighter around it', async () => {
  let r = await run('twoTone')
  assert.deepEqual(r.default.band, [0, 0, 255, 255], 'the band takes the line color')
  assert.deepEqual(r.default.edge, [115, 115, 255, 255], 'the envelope, the line color lightened 45 % toward white')
  assert.deepEqual(r.peaks.edge, [255, 0, 0, 255], 'peaks sets the envelope')
  assert.deepEqual(r.none.edge, [0, 0, 255, 255], 'without the band, the envelope takes the line color')
})

test('render: NaN is a gap, ±Infinity is clamped to the edge', async () => {
  let r = await run('gaps')
  assert.equal(r.inGap, 0, 'nothing drawn over NaN')
  assert.equal(r.gapPick, null)
  assert.equal(r.up[0], 0, '+Infinity reaches the top')
  assert.equal(r.down[1], 99, '-Infinity reaches the bottom')
  assert.equal(r.upPick.max, Infinity)
  for (let s of r.beside) assert.ok(s && s[0] > 30 && s[1] < 70, `neighbours of an infinity stay put: ${JSON.stringify(r.beside)}`)
})

test('colors: CSS strings including oklch match the 2D canvas; invalid throws', async () => {
  let r = await run('colors')
  for (let c of ['oklch(0.7 0.15 250)', 'rebeccapurple', '#0f08']) {
    r[c].gl.forEach((v, i) => assert.ok(Math.abs(v - r[c].css[i]) <= 1, `${c}: ${r[c].gl} vs ${r[c].css}`))
  }
  assert.match(r.invalid, /invalid color/)
})

test('context loss: no throws while lost, redraws on restore', async () => {
  let r = await run('lose')
  assert.deepEqual(r.errors, [])
  assert.equal(r.length, 1002, 'push while lost appends, set while lost overwrites')
  assert.ok(r.ink > 100, 'drawn again after restore')
})

test('api: errors, getters, range follows push, data is referenced, destroy', async () => {
  let r = await run('api')
  assert.equal(r.ctor, 'TypeError', 'a canvas without WebGL2 throws')
  for (let k of ['range', 'amplitude', 'viewport', 'thickness', 'pixelRatio']) assert.equal(r.errors[k], 'TypeError', `bad ${k} throws`)
  assert.equal(r.offset, 'RangeError', 'negative offset throws')
  assert.equal(r.length, 70003)
  assert.deepEqual(r.range, [0, 70003], 'default range follows push()')
  assert.deepEqual(r.shared, [0, 5], 'set() changes the waveform, never the array given to update({ data })')
  assert.deepEqual(r.getters, [[2, 4], [1, -1]])
  assert.deepEqual(r.defaults, [[0, 70003], [-1, 1]], 'null restores defaults')
  assert.deepEqual(r.afterDestroy, [0, 0], 'destroyed: no data, draws nothing')
})
