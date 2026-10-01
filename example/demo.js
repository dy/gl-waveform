import Waveform from '../index.js'
import { generator, parse } from './data.js'
import { $, css, num, clamp, error, frame, step, label, setup, decode } from './ui.js'

const canvas = $('chart'), ax = $('axes').getContext('2d'), grid = $('grid').getContext('2d')
const LEFT = 44, TOP = 24, GAP = 8, COLORS = ['#79c6ed', '#87c6a5', '#d5b47b', '#bf9de4', '#e7a597', '#87c6a5', '#b8bceb', '#e1d2b5']
let lanes = [], names = [], colors = [], bounds = [Infinity, -Infinity], gen, range = [0, 8192], amplitude = [-1.25, 1.25]
let indexed = 0, baseCount = 0, streamStart = 0, streamed = 0, frames = [], cost = 0, reported = 0, paint = true
let w = 1, h = 1, pr = 1, pw = 1, lh = 1, dirty = true, running = false, last = 0, task = 0, title = '', source = 'voice'
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
function stop() { running = false; status(); $('stream').textContent = 'Stream'; $('stream').setAttribute('aria-pressed', 'false') }
function status() { $('status').value = `${title}  ${names.length} ${names.length === 1 ? 'trace' : 'traces'}  ${label(length())} samples${indexed ? `  indexed ${indexed} ms` : ''}` }
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
  try { const start = performance.now(); next.forEach(d => fresh.push(new Waveform(canvas, { data: d }))); indexed = Math.round(performance.now() - start) }
  catch (e) { fresh.forEach(wf => wf.destroy()); throw e }
  lanes.forEach(wf => wf.destroy()); lanes = fresh; names = labels; title = heading
  bounds = [Infinity, -Infinity]
  if (source === 'voice') bounds = [num('offset') - num('magnitude'), num('offset') + num('magnitude')]
  else include(next)
  const gl = lanes[0].gl; gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT)
  colors = labels.map((_, i) => COLORS[source === 'voice' ? 0 : i % COLORS.length]); $('colors').replaceChildren()
  labels.forEach((name, i) => {
    const label = document.createElement('label'), input = document.createElement('input')
    label.textContent = name; input.type = 'color'; input.value = colors[i]; input.setAttribute('aria-label', `${name} color`)
    input.oninput = () => { colors[i] = input.value; paint = dirty = true }
    label.append(input); $('colors').append(label)
  })
  $('generator').disabled = source === 'file'; $('streaming').disabled = source === 'file'; $('stream').disabled = source === 'file'
  $('cycles').disabled = source !== 'osc' && source !== 'steps' && source !== 'gaps'
  baseCount = next[0].length
  for (const id of ['spike', 'clip', 'silence']) $(id).hidden = source !== 'voice'
  value(0, length()); fitValues(); layout(); status(); error(''); paint = true
}
async function generate() {
  const id = ++task; stop(); const nextSource = $('source').value
  if (nextSource === 'file') return
  const opts = Object.fromEntries(['cycles', 'count', 'magnitude', 'offset', 'rate'].map(key => [key, num(key)]))
  const nextGen = generator(nextSource, opts)
  $('stream').disabled = true
  $('status').value = 'Generating…'
  try {
    const next = nextGen.names.map(() => new Float32Array(opts.count))
    for (let a = 0; a < opts.count; a += 4194304) {
      const blocks = nextGen.next(Math.min(4194304, opts.count - a))
      blocks.forEach((block, c) => next[c].set(block, a))
      $('status').value = `Generating ${Math.round(Math.min(a + 4194304, opts.count) / opts.count * 100)}%…`
      await frame(); if (id !== task) return
    }
    source = nextSource; gen = nextGen
    $('source').querySelector('[value=file]').hidden = true
    install(next, gen.names, $('source').selectedOptions[0].textContent)
  } catch (e) { if (id === task) { error(e.message); status(); $('stream').disabled = !gen || source === 'file' } }
}
function inspect(x, y) {
  const i = Math.floor((y - TOP) / (lh + GAP)), local = y - TOP - i * (lh + GAP)
  const p = i >= 0 && i < lanes.length && x >= LEFT && x < LEFT + pw && local <= lh ? lanes[i].pick(x - LEFT) : null
  $('readout').value = p ? `${names[i]}  sample ${label(p.from)}  ${p.to - p.from === 1 ? 'value ' + label(p.min) : `min ${label(p.min)} / max ${label(p.max)} / rms ${label(p.rms)}`}` : ''
}
function axes() {
  for (const ctx of [ax, grid]) { ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.clearRect(0, 0, w, h) }
  ax.font = `11px ${css('--font')}`; ax.fillStyle = css('--dim'); grid.fillStyle = css('--grid')
  const [a, b] = range.map(v => v / unit()), timed = $('units').value === 'time', on = $('grid-on').checked
  const inc = timed && b - a >= 120 ? [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].find(n => n >= (b - a) / Math.max(1, pw / 90)) || step(b - a, pw) : step(b - a, pw)
  for (let n = Math.ceil(a / inc); n * inc <= b; n++) {
    const v = n * inc, x = LEFT + (v - a) / (b - a) * pw
    const text = timed && b - a >= 120 ? `${v < 0 ? '−' : ''}${Math.floor(Math.abs(v) / 60)}:${String(Math.round(Math.abs(v) % 60)).padStart(2, '0')}` : label(v) + (timed ? ' s' : '')
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
  fit: () => { stop(); value(0, length()) }, inspect })
$('spike').onclick = () => { stop(); const at = Math.round((Math.round(.308 * baseCount) + Math.round(.3122 * baseCount)) / 2); view(at - Math.min(48000, baseCount * .01), at + Math.min(48000, baseCount * .01)) }
$('clip').onclick = () => { stop(); view(baseCount * .66, baseCount * .70) }
$('silence').onclick = () => { stop(); view(baseCount * .078, baseCount * .092) }
$('samples').onclick = () => { stop(); const c = (range[0] + range[1]) / 2; view(c - 24, c + 24) }
$('auto-fit').onclick = fitValues
$('source').onchange = () => {
  $('units').value = $('source').value === 'voice' ? 'time' : 'samples'
  $('rate-row').hidden = $('units').value !== 'time'
  generate()
}
$('stream').onclick = () => {
  if (running) return stop()
  running = true; streamStart = last = performance.now(); streamed = 0; frames = []; reported = 0; $('stream').textContent = 'Pause'; $('stream').setAttribute('aria-pressed', 'true')
  if ($('follow').checked) value(Math.max(0, length() - num('block') * 120), length())
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
  $('rate-row').hidden = $('units').value !== 'time'; paint = dirty = true
}
$('generator').onchange = e => { if (e.target.validity.valid && e.target.value) generate() }
$('controls').onreset = () => { queueMicrotask(() => { $('source').value = 'voice'; document.documentElement.style.removeProperty('--plot-bg'); $('rate-row').hidden = false; $('thickness-value').value = '1.5 px'; $('opacity-value').value = '90%'; generate() }) }
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

const params = new URLSearchParams(location.search)
const requested = params.has('minutes') ? Math.round(+params.get('minutes') * 60 * 48000) : +params.get('samples')
if (Number.isFinite(requested) && requested >= 4 && requested <= 172800000) {
  const option = new Option(label(requested), String(requested), true, true)
  $('count').append(option)
}
requestAnimationFrame(function draw(now) {
  requestAnimationFrame(draw)
  const start = performance.now()
  if (running && now - last >= 1000 / (num('speed') || 60) - 1) {
    last = now
    // Cap only the appended data; the hour-long default can stream immediately.
    if (length() - baseCount + num('block') > 50000000) { stop(); error('50 million samples appended. Choose a source to start a new stream.') }
    else {
      const blocks = gen.next(num('block')), n = blocks[0].length
      include(blocks); lanes.forEach((wf, i) => wf.push(blocks[i])); streamed += n
      if ($('follow').checked) value(range[0] + n, range[1] + n)
      dirty = true
    }
  }
  if (!dirty || !lanes.length) return
  dirty = false
  try {
    lanes.forEach((wf, i) => {
      if (paint) {
        const color = colors[i] + Math.round(num('opacity') * 255).toString(16).padStart(2, '0')
        wf.update({ color, thickness: num('thickness'), rms: $('fill').value === 'rms', density: $('fill').value === 'density' })
      }
      wf.update({ range, amplitude }).clear().render()
    })
    paint = false; axes()
    cost = performance.now() - start
    frames.push(now); while (frames[0] < now - 1000) frames.shift()
    if (!running || now - reported >= 250) {
      const fps = frames.length > 1 ? Math.round((frames.length - 1) * 1000 / (now - frames[0])) : 0
      const speed = streamed / Math.max(.001, (now - streamStart) / 1000) / 1e6
      $('perf').value = `${running ? `${fps} fps  ${speed.toFixed(2)}M samples/s  ` : ''}${cost.toFixed(1)} ms/frame`
      $('perf').title = 'CPU time includes signal generation, append, rendering and axes; excludes GPU completion.'
      status(); reported = now
    }
  } catch (e) { stop(); error(e.message) }
})
await generate()
