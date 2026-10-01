import Waveform from '../index.js'
import { generator, parse } from './data.js'
import { $, css, num, clamp, error, frame, step, label, setup, decode } from './ui.js'

const canvas = $('chart'), ax = $('axes').getContext('2d'), grid = $('grid').getContext('2d')
const LEFT = 52, TOP = 30, GAP = 32, COLORS = ['#d35e43', '#668843', '#377fae', '#9563aa', '#ac7a2c', '#337a75', '#a14f76', '#6c7380']
let lanes = [], names = [], colors = [], bounds = [Infinity, -Infinity], gen, range = [0, 8192], amplitude = [-1.25, 1.25]
let w = 1, h = 1, pr = 1, pw = 1, lh = 1, dirty = true, running = false, last = 0, task = 0, title = '', source = 'osc'
const length = () => lanes[0]?.length || 1
const unit = () => $('units').value === 'time' ? num('rate') || 48000 : 1
const value = (a, b) => { range = [a, b]; dirty = true }
function view(a, b) {
  const span = clamp(b - a, 4, length() * 1.5), start = clamp(a, -span / 4, length() - span * .75)
  value(start, start + span)
  $('follow').checked = false
}
function zoom(x, factor) {
  const u = clamp((x - LEFT) / pw, 0, 1), s = range[0] + u * (range[1] - range[0])
  view(s - (s - range[0]) * factor, s + (range[1] - s) * factor)
}
function layout() {
  pw = Math.max(1, w - LEFT - 12); lh = Math.max(1, (h - TOP - GAP * (lanes.length - 1)) / Math.max(1, lanes.length))
  lanes.forEach((wf, i) => wf.update({ viewport: [LEFT, TOP + i * (lh + GAP), pw, lh], pixelRatio: pr }))
  dirty = true
}
function stop() { running = false; $('stream').textContent = 'Stream'; $('stream').setAttribute('aria-pressed', 'false') }
function status() { $('status').value = `${title} · ${names.length} ${names.length === 1 ? 'trace' : 'traces'} · ${label(length())} samples` }
function include(data) {
  for (const d of data) for (const v of d) if (Number.isFinite(v)) { bounds[0] = Math.min(bounds[0], v); bounds[1] = Math.max(bounds[1], v) }
}
function fitValues() {
  let [lo, hi] = bounds
  if (!Number.isFinite(lo)) { lo = -1; hi = 1 }
  const pad = Math.max((hi - lo) * .12, Math.abs(hi) * .01, .01)
  amplitude = [lo - pad, hi + pad]
  $('low').value = Number(amplitude[0].toPrecision(7)); $('high').value = Number(amplitude[1].toPrecision(7))
  dirty = true
}
function install(next, labels, heading) {
  stop()
  const fresh = []
  try { next.forEach(d => fresh.push(new Waveform(canvas, { data: d }))) }
  catch (e) { fresh.forEach(wf => wf.destroy()); throw e }
  lanes.forEach(wf => wf.destroy()); lanes = fresh; names = labels; title = heading
  bounds = [Infinity, -Infinity]; include(next)
  const gl = lanes[0].gl; gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT)
  colors = labels.map((_, i) => COLORS[i % COLORS.length]); $('colors').replaceChildren()
  labels.forEach((name, i) => {
    const label = document.createElement('label'), input = document.createElement('input')
    label.textContent = name; input.type = 'color'; input.value = colors[i]; input.setAttribute('aria-label', `${name} color`)
    input.oninput = () => { colors[i] = input.value; dirty = true }
    label.append(input); $('colors').append(label)
  })
  $('generator').disabled = source === 'file'; $('streaming').disabled = source === 'file'; $('stream').disabled = source === 'file'
  $('cycles').disabled = source !== 'osc' && source !== 'steps' && source !== 'gaps'
  value(0, length()); fitValues(); layout(); status(); error('')
}
async function generate() {
  const id = ++task; stop(); const nextSource = $('source').value
  if (nextSource === 'file') return
  const opts = Object.fromEntries(['cycles', 'count', 'magnitude', 'offset', 'rate'].map(key => [key, num(key)]))
  const nextGen = generator(nextSource, opts), next = nextGen.names.map(() => new Float32Array(opts.count))
  $('status').value = 'Generating…'
  try {
    for (let a = 0; a < opts.count; a += 262144) {
      const blocks = nextGen.next(Math.min(262144, opts.count - a))
      blocks.forEach((block, c) => next[c].set(block, a))
      await frame(); if (id !== task) return
    }
    source = nextSource; gen = nextGen
    $('source').querySelector('[value=file]').hidden = true
    install(next, gen.names, $('source').selectedOptions[0].textContent)
  } catch (e) { if (id === task) { error(e.message); status() } }
}
function inspect(x, y) {
  const i = Math.floor((y - TOP) / (lh + GAP)), local = y - TOP - i * (lh + GAP)
  const p = i >= 0 && i < lanes.length && x >= LEFT && x < LEFT + pw && local <= lh ? lanes[i].pick(x - LEFT) : null
  $('readout').value = p ? `${names[i]} · sample ${label(p.from)} · ${p.to - p.from === 1 ? 'value ' + label(p.min) : `min ${label(p.min)} / max ${label(p.max)} / rms ${label(p.rms)}`}` : 'Move over a trace to inspect samples.'
}
function axes() {
  for (const ctx of [ax, grid]) { ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.clearRect(0, 0, w, h) }
  ax.font = `11px ${css('--font')}`; ax.fillStyle = css('--dim'); grid.fillStyle = css('--grid')
  const [a, b] = range.map(v => v / unit()), inc = step(b - a, pw), on = $('grid-on').checked
  for (let n = Math.ceil(a / inc); n * inc <= b; n++) {
    const v = n * inc, x = LEFT + (v - a) / (b - a) * pw
    const text = label(v) + ($('units').value === 'samples' ? '' : ' s')
    if (x + ax.measureText(text).width + 3 < w) ax.fillText(text, x + 3, 12)
    if (on) grid.fillRect(Math.round(x), TOP, 1, h - TOP)
  }
  const [lo, hi] = amplitude, dy = step(Math.abs(hi - lo), lh * 2)
  lanes.forEach((wf, i) => {
    const top = TOP + i * (lh + GAP)
    ax.fillStyle = colors[i]; ax.fillText(names[i], LEFT + 8, top + 14); ax.fillStyle = css('--dim')
    for (let n = Math.ceil(Math.min(lo, hi) / dy); n * dy <= Math.max(lo, hi); n++) {
      const v = n * dy, y = top + (hi - v) / (hi - lo) * lh
      const tick = Math.abs(v) >= 1e5 || (v && Math.abs(v) < .001) ? v.toExponential(1) : label(v)
      ax.textAlign = 'right'; ax.fillText(tick, LEFT - 8, clamp(y + 4, top + 10, top + lh)); ax.textAlign = 'left'
      if (on) grid.fillRect(LEFT, Math.round(y), pw, 1)
    }
  })
  $('view').value = `${label(a)} → ${label(b)} ${$('units').value === 'samples' ? 'samples' : 's'}`
}

setup({ resize: (width, height, ratio) => { w = width; h = height; pr = ratio; layout() }, zoom,
  pan: dx => { const d = dx / pw * (range[1] - range[0]); view(range[0] + d, range[1] + d) },
  fit: () => value(0, length()), inspect })
$('samples').onclick = () => { const c = (range[0] + range[1]) / 2; view(c - 24, c + 24) }
$('auto-fit').onclick = fitValues
$('source').onchange = generate
$('stream').onclick = () => {
  if (running) return stop()
  running = true; last = performance.now(); $('stream').textContent = 'Pause'; $('stream').setAttribute('aria-pressed', 'true')
  if ($('follow').checked) value(Math.max(0, length() - num('count')), length())
}
$('controls').oninput = e => {
  if (!e.target.validity.valid || (e.target.type === 'number' && !e.target.value)) return
  if (['cycles', 'magnitude', 'offset'].includes(e.target.id)) return // generate on commit
  if (['low', 'high'].includes(e.target.id)) {
    if (num('low') === num('high')) return error('Value min and max must differ.')
    amplitude = [num('low'), num('high')]; error('')
  }
  $('thickness-value').value = `${num('thickness')} px`; $('opacity-value').value = `${Math.round(num('opacity') * 100)}%`
  document.documentElement.style.setProperty('--plot-bg', $('background').value)
  $('rate-row').hidden = $('units').value !== 'time'; dirty = true
}
$('generator').onchange = e => { if (e.target.validity.valid && e.target.value) generate() }
$('controls').onreset = () => { queueMicrotask(() => { $('source').value = 'osc'; document.documentElement.style.removeProperty('--plot-bg'); $('rate-row').hidden = true; $('thickness-value').value = '1.5 px'; $('opacity-value').value = '90%'; generate() }) }
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return
  const id = ++task; stop(); $('status').value = `Opening ${file.name}…`
  try {
    const numeric = /\.(json|csv|txt)$/i.test(file.name)
    const result = numeric ? { data: parse(await file.text(), /\.json$/i.test(file.name)) } : await decode(file)
    if (id !== task) return
    if (result.data.length > 8) throw Error('Open a file with at most 8 channels.')
    source = 'file'; $('source').value = 'file'; $('source').querySelector('[value=file]').hidden = false
    if (result.rate) { $('rate').value = result.rate; $('units').value = 'time'; $('rate-row').hidden = false }
    else { $('units').value = 'samples'; $('rate-row').hidden = true }
    install(result.data, result.data.map((_, i) => `Channel ${i + 1}`), file.name)
  } catch (e) { if (id === task) { error(`Cannot open ${file.name}: ${e.message}`); status() } }
  finally { $('file').value = '' }
}

requestAnimationFrame(function draw(now) {
  requestAnimationFrame(draw)
  if (running && now - last >= 1000 / (num('speed') || 12)) {
    last = now
    // Keep a tab left streaming from growing without bound.
    if (length() + num('block') > 20000000) { stop(); error('20 million samples reached. Choose a source to start a new stream.') }
    else {
      const blocks = gen.next(num('block')), n = blocks[0].length
      include(blocks)
      lanes.forEach((wf, i) => wf.push(blocks[i]))
      if ($('follow').checked) value(range[0] + n, range[1] + n)
      dirty = true; status()
    }
  }
  if (!dirty || !lanes.length) return
  dirty = false; const start = performance.now()
  try {
    lanes.forEach((wf, i) => {
      const color = colors[i] + Math.round(num('opacity') * 255).toString(16).padStart(2, '0')
      wf.update({ range, amplitude, color, thickness: num('thickness'), rms: $('fill').value === 'rms', density: $('fill').value === 'density' }).clear().render()
    })
    axes(); $('perf').value = `${(performance.now() - start).toFixed(1)} ms/frame · ${((range[1] - range[0]) / (pw * pr)).toFixed(1)} samples/px`
  } catch (e) { stop(); error(e.message) }
})
await generate()
