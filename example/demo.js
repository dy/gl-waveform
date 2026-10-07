// gl-waveform's demo, on gl-spectrum's v3 page: sound comes in from the right as it plays, as on a recorder; drag or
// scroll back through it, wheel or pinch across to zoom time, Shift+wheel or a vertical pinch to zoom the amplitude.
// An hour of synthetic speech comes in the same way, pushed as fast as it is generated.
import Waveform from '../index.js'
import { generator, parse } from './data.js'
import { $, clamp, css, alpha, palette, picker, sound, gestures, timeline, glide, rules, pretty, step } from './app.js'

const SPAN = 20, KEEP = 2 ** 25, HOUR = 172800000 // seconds in view at first; samples held, older ones drawn from their peaks
const canvas = $('chart'), wf = new Waveform(canvas)
const newest = glide()
let rate = 48000, view = timeline(rate * SPAN), amp = 1, peak = 0, fixed = false, look = null, w = 0, h = 0, pr = 0, dirty = true, task = 0

const ui = picker(start, [['Signals', [{ id: 'hour', name: 'An hour of synthetic speech' }]]])
const audio = sound({ chunk: take, state: on => { ui.playing(on); if (on) $('hint').hidden = true } })

// ── data ──────────────────────────────────────────────────────────────────

// Chunks as they sound, mixed to one channel; past KEEP samples the oldest are let go, their peaks kept
function take(chunk) {
  const n = chunk[0].length, mono = new Float32Array(n)
  for (const c of chunk) for (let i = 0; i < n; i++) mono[i] += c[i] / chunk.length
  wf.push(mono); fit(mono)
  if (wf.length > KEEP) wf.drop(0, wf.length - KEEP / 2)
  dirty = true
}
function reset(sr, span = sr * SPAN) {
  rate = sr; view = timeline(span); peak = 0; fixed = false; amp = 1; wf.update({ data: new Float32Array(0) }); dirty = true
}
// the amplitude follows the loudest sample so far, in 1-2-5 steps, till zoomed by hand
function fit(d) {
  for (const v of d) if (Math.abs(v) > peak) peak = Math.abs(v)
  if (!fixed && peak) amp = step(peak * 1.1, 1, 1) // the 1-2-5 value at or above the peak, with headroom
}
// The hour: a million samples a frame, the view the whole hour, so it comes in from the right
async function hour(id) {
  const gen = generator('voice', { count: HOUR })
  reset(48000, HOUR)
  for (let a = 0; a < HOUR && id === task; a += 1 << 20) {
    const [d] = gen.next(Math.min(1 << 20, HOUR - a))
    wf.push(d); if (!a) fit(d); dirty = true
    await new Promise(requestAnimationFrame)
  }
}

// ── view ──────────────────────────────────────────────────────────────────

// The middle of the page, clear of the source above and the settings below
const box = () => [0, h * .15, w, h * .6]
function layout() {
  w = innerWidth; h = innerHeight; pr = devicePixelRatio
  for (const c of [canvas, $('grid')]) { c.width = Math.round(w * pr); c.height = Math.round(h * pr) }
  wf.update({ viewport: box(), pixelRatio: pr }); dirty = true
}
gestures(canvas, {
  pan(dx) { view.pan(-dx / w * view.span, newest(wf.length, rate, audio.playing)); dirty = true },
  zoom(x, y, kx, ky) {
    if (kx !== 1) view.zoom(x / w, kx, wf.length, Math.max(wf.length, view.span) * 1.25)
    if (ky !== 1) { amp = clamp(amp * ky, 1e-3, 1e3); fixed = true }
    dirty = true
  },
  fit() { view.fit(Math.max(wf.length, rate)); fixed = false; fit([]); dirty = true }
})

// ── look ──────────────────────────────────────────────────────────────────

// The line and the RMS band in the ink, the envelope around the band softer, toward the page
const paint = () => {
  const env = $('envelope').value
  wf.update({ color: css(look.color(1)), rms: env === 'rms' ? null : false, peaks: env === 'rms' ? css(look.color(.4)) : null, density: env === 'density', thickness: +$('width').value })
  dirty = true
}
palette(l => { look = l; paint() })
for (const id of ['envelope', 'width']) $(id).oninput = paint
$('grid-on').onchange = () => dirty = true
addEventListener('resize', layout)

const clock = s => s < 60 ? `${pretty(s)} s` : s < 3600 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  : `${Math.floor(s / 3600)}:${String(Math.floor(s / 60 % 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// plot-grid: seconds along the bottom, levels along the left edge of the waveform
function rule([from, to]) {
  const { g, px } = rules($('grid'))
  if (!$('grid-on').checked || !look) return
  const ink = look.color(.75), [a, b] = [from / rate, to / rate], dt = b - a >= 120 ? [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find(s => s >= (b - a) / (w / 90)) ?? 3600 : step(b - a, w, 90)
  for (let t = Math.max(0, Math.ceil(a / dt)) * dt; t <= b; t += dt) {
    const x = Math.round((t - a) / (b - a) * w / px) * px
    g.fillStyle = css(alpha(ink, .1)); g.fillRect(x, 0, px, h)
    g.fillStyle = css(ink); g.fillRect(x, h - 4, px, 4); g.fillText(clock(+t.toFixed(6)), x + 3.5, h)
  }
  const [, top, , height] = box(), dv = step(2 * amp, height, 40)
  for (let v = Math.ceil(-amp / dv) * dv; v <= amp; v += dv) {
    const y = Math.round((top + (1 - (v + amp) / (2 * amp)) * height) / px) * px
    g.fillStyle = css(alpha(ink, Math.abs(v) < dv / 2 ? .3 : .1)); g.fillRect(0, y, w, px)
    g.fillStyle = css(ink); g.fillRect(0, y, 4, px); g.fillText(pretty(+v.toPrecision(6)), 6, y + 4.5)
  }
}

// ── sound ─────────────────────────────────────────────────────────────────

// ?source= picks the first: a recording, a stream or mic
let current = ui.items[new URLSearchParams(location.search).get('source')] ?? ui.items.cello
async function start(it) {
  const id = ++task
  current = it; ui.show(it); audio.stop()
  if (it.id === 'hour') { $('hint').hidden = true; return hour(id) }
  // numbers, one array or channel per column: drawn whole, the first channel
  if (it.file && /\.(json|csv|txt)$/i.test(it.file.name)) {
    try { const [d] = parse(await it.file.text(), /\.json$/i.test(it.file.name)); reset(1, d.length); wf.update({ data: d }); fit(d); return }
    catch (e) { return ui.show(it, e.message) }
  }
  try {
    reset(audio.context?.sampleRate ?? rate)
    await audio.start(it)
    if (audio.context.sampleRate !== rate) reset(audio.context.sampleRate)
  } catch (e) { audio.stop(); ui.show(it, e.message) }
}
$('play').onclick = () => audio.element || audio.playing ? audio.toggle() : start(current)
$('file').accept = 'audio/*,.csv,.txt,.json'

requestAnimationFrame(function frame() {
  requestAnimationFrame(frame)
  if (!dirty && !audio.playing) return
  dirty = false
  const range = view.range(newest(wf.length, rate, audio.playing))
  wf.update({ range, amplitude: [-amp, amp] }).clear().render()
  rule(range)
  const el = audio.element
  ui.progress(el && isFinite(el.duration) ? el.currentTime / el.duration : 0)
})

ui.show(current)
layout()
document.fonts?.ready.then(() => dirty = true)
