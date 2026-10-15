// gl-waveform's demo, on gl-spectrum's v3 page. A recording is decoded whole and drawn before it plays, its first 20 s
// in view; ▶ plays what is in view, and the view scrolls once the playhead reaches its middle. Radio and the microphone
// come in from the right as they sound, as on a recorder; an hour of synthetic speech comes in the same way, pushed for
// half of each frame. Drag or scroll through it, wheel or pinch across to zoom time, Shift+wheel or a vertical pinch to
// zoom the amplitude.
import Waveform from '../index.js'
import { generator, parse } from './data.js'
import { download } from './sources.js'
import { $, clamp, css, alpha, palette, picker, sound, gestures, timeline, glide, rules, pretty, step } from './app.js'

const SPAN = 20, KEEP = 2 ** 25, HOUR = 172800000, RATE = 48000 // seconds in view at first; samples held, older ones drawn from their peaks; the rate sound is decoded at
const canvas = $('chart'), wf = new Waveform(canvas)
const newest = glide()
let rate = RATE, view = timeline(rate * SPAN), amp = 1, fitted = 1, look = null, w = 0, h = 0, pr = 0, dirty = true, task = 0

const ui = picker(start, [['Signals', [{ id: 'hour', name: 'An hour of synthetic speech' }]]])
const audio = sound({ chunk: take, state: on => { ui.playing(on); if (on) $('hint').hidden = true } })
const numbers = it => /\.(json|csv|txt)$/i.test(it.file?.name)
const whole = it => it.url && !it.live && !numbers(it) // a recording or an audio file: decoded whole, then played

// ── data ──────────────────────────────────────────────────────────────────

// Chunks as they sound, mixed to one channel; past KEEP samples the oldest are let go, their peaks kept
function take(chunk) {
  const n = chunk[0].length, mono = new Float32Array(n)
  for (const c of chunk) for (let i = 0; i < n; i++) mono[i] += c[i] / chunk.length
  push(mono)
  if (wf.length > KEEP) wf.drop(0, wf.length - KEEP / 2)
}
// For the meter: samples pushed after the first since it last read, and the times of that first and the last
let fed = 0, t1 = 0, t2 = 0
function push(d) {
  wf.push(d); dirty = true
  const now = performance.now()
  if (t1) fed += d.length; else t1 = now
  t2 = now
}
// A new source: data in a view span samples wide, at ±top, which a double click comes back to. Sound as it comes is
// at full scale, ±1, so a louder passage never shrinks what is drawn
function reset(sr, span = sr * SPAN, data = new Float32Array(0), top = 1) {
  rate = sr; view = timeline(span); fitted = amp = top; wf.update({ data }); dirty = true
  if (data.length) $('hint').hidden = true // ▶ beside the title is enough over a waveform
}
// Data held whole fills the height: the 1-2-5 value at or above its peak, with headroom; for sound, ±1 at most
function top(d, most = Infinity) {
  let p = 0
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > p) p = Math.abs(d[i])
  return p ? Math.min(step(p * 1.1, 1, 1), most) : 1
}
// The hour, generated and pushed for half of each frame, so the view scrolls on as it comes; the view the whole hour,
// so it comes in from the right
async function hour(id) {
  const gen = generator('voice', { count: HOUR, channels: 1 }), buf = new Float32Array(1 << 16) // one block, written over: push copies it
  reset(RATE, HOUR)
  for (let a = 0, t = performance.now(), dt = 16; a < HOUR && id === task;) {
    for (const end = performance.now() + dt / 2; a < HOUR && performance.now() < end; a += buf.length) push(gen.next(Math.min(buf.length, HOUR - a), [buf.subarray(0, HOUR - a)])[0])
    const now = await new Promise(requestAnimationFrame)
    dt = clamp(now - t, 8, 17); t = now
  }
}

// ── a recording, decoded whole ────────────────────────────────────────────

// clip, the sound drawn, an AudioBuffer; ctx, the context it plays in; node, its source while it plays; head, the
// playhead in samples when it last started or stopped, t0 the context's time then; want, to play once decoded;
// chasing, the view following the playhead till dragged; got, the share downloaded
let clip = null, ctx = null, node = null, head = 0, t0 = 0, want = false, chasing = true, loading = false, got = 0
async function load(it, id) {
  reset(RATE); got = 0; loading = true
  try {
    const file = it.file ?? await download(it.url, t => { if (id === task) got = t, dirty = true })
    if (it.file) URL.revokeObjectURL(it.url)
    const b = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer())
    if (id !== task) return
    // one channel, the mean of all: a copy, as playing takes the buffer's own arrays
    const n = b.length, k = b.numberOfChannels, mono = new Float32Array(n)
    for (let c = 0; c < k; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / k }
    clip = b; head = got = 0
    reset(b.sampleRate, Math.min(n, b.sampleRate * SPAN), mono, top(mono, 1))
    view.follow = false // it stands at the start
    if (want) play()
  } catch (e) { if (id === task) { pause(); ui.show(it, e.message) } }
  finally { if (id === task) loading = false }
}
// The playhead, in samples: the sound leaving the speakers now, by the context's output clock
function playhead() {
  if (!node) return head
  const o = ctx.getOutputTimestamp?.(), now = o?.performanceTime > 0 ? o.contextTime + (performance.now() - o.performanceTime) / 1e3 : ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
  return Math.min(head + Math.max(now - t0, 0) * clip.sampleRate, clip.length)
}
// ▶ plays what is in view: from the playhead if it shows, else from the view's start. The context is made here, in a
// click, so the browser lets the sound begin
function play() {
  want = chasing = true; ui.playing(true); $('hint').hidden = true
  ctx ??= new AudioContext(); ctx.resume()
  if (!clip || node) return
  const a = view.end - view.span
  if (!(head >= a && head < Math.min(view.end, clip.length))) head = clamp(Math.ceil(a), 0, clip.length - 1)
  const n = node = new AudioBufferSourceNode(ctx, { buffer: clip })
  n.onended = () => { if (node === n) { node = null; head = clip.length; want = false; ui.playing(false); dirty = true } }
  n.connect(ctx.destination)
  n.start(0, head / clip.sampleRate); t0 = ctx.currentTime
}
function pause() {
  want = false; ui.playing(false)
  if (!node) return
  head = playhead(); node.onended = null; node.stop(); node = null; dirty = true
}
// Playing, the view holds the playhead at its middle once it gets there, till the end of the sound
function chase(p) {
  if (chasing && p > view.end - view.span / 2 && p < view.end) view.end = Math.min(p + view.span / 2, wf.length)
}

// ── view ──────────────────────────────────────────────────────────────────

// The middle of the page, clear of the source above and the settings below
const box = () => [0, h * .15, w, h * .6]
function layout() {
  w = innerWidth; h = innerHeight; pr = devicePixelRatio
  for (const c of [canvas, $('grid')]) { c.width = Math.round(w * pr); c.height = Math.round(h * pr) }
  wf.update({ viewport: box(), pixelRatio: pr }); dirty = true
}
// The view's right edge at most: a recording's end, else the newest sample, gliding as it comes
const edge = () => clip ? wf.length : newest(wf.length, rate, audio.playing)
// A recording's view stays where it is put; sound as it comes is followed from the right till dragged back
const moved = () => { if (clip) view.follow = false; dirty = true }
gestures(canvas, {
  pan(dx) { view.pan(-dx / w * view.span, edge()); chasing = false; moved() },
  zoom(x, y, kx, ky) {
    if (kx !== 1) view.zoom(x / w, kx, wf.length, Math.max(wf.length, view.span) * 1.25)
    if (ky !== 1) amp = clamp(amp * ky, 1e-3, 1e3)
    moved()
  },
  fit() { view.fit(Math.max(wf.length, rate)); amp = fitted; chasing = true; moved() }
})

// ── look ──────────────────────────────────────────────────────────────────

// The line and the RMS band in the ink, the envelope around the band softer, toward the page
const paint = () => {
  const env = $('envelope').value
  wf.update({ color: css(look.color(1)), rms: env === 'rms' ? null : false, peaks: env === 'rms' ? css(look.color(.4)) : null, density: env === 'gaussian' || env === 'laplace' ? env : false, thickness: +$('width').value })
  dirty = true
}
palette(l => { look = l; paint() })
for (const id of ['envelope', 'width']) $(id).oninput = paint
$('grid-on').onchange = () => dirty = true
addEventListener('resize', layout)

const clock = s => s < 60 ? `${pretty(s)} s` : s < 3600 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  : `${Math.floor(s / 3600)}:${String(Math.floor(s / 60 % 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// plot-grid: seconds along the bottom, levels along the left edge of the waveform; the playhead p across it
function rule([from, to], p) {
  const { g, px } = rules($('grid'))
  if (!look) return
  const ink = look.color(.75), [, top, , height] = box()
  if ($('grid-on').checked) {
    const [a, b] = [from / rate, to / rate], dt = b - a >= 120 ? [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find(s => s >= (b - a) / (w / 90)) ?? 3600 : step(b - a, w, 90)
    for (let t = Math.max(0, Math.ceil(a / dt)) * dt; t <= b; t += dt) {
      const x = Math.round((t - a) / (b - a) * w / px) * px
      g.fillStyle = css(alpha(ink, .1)); g.fillRect(x, 0, px, h)
      g.fillStyle = css(ink); g.fillRect(x, h - 4, px, 4); g.fillText(clock(+t.toFixed(6)), x + 3.5, h)
    }
    const dv = step(2 * amp, height, 40)
    for (let v = Math.ceil(-amp / dv) * dv; v <= amp; v += dv) {
      const y = Math.round((top + (1 - (v + amp) / (2 * amp)) * height) / px) * px
      g.fillStyle = css(alpha(ink, Math.abs(v) < dv / 2 ? .3 : .1)); g.fillRect(0, y, w, px)
      g.fillStyle = css(ink); g.fillRect(0, y, 4, px); g.fillText(pretty(+v.toPrecision(6)), 6, y + 4.5)
    }
  }
  // the playhead: the ink between two strokes of the page, so it shows over the waveform too
  if (p == null || p < from || p > to) return
  const x = Math.round((p - from) / (to - from) * w / px) * px
  g.fillStyle = css(look.color(0)); g.fillRect(x - 1, top, 3, height)
  g.fillStyle = css(look.color(1)); g.fillRect(x, top, 1, height)
}
// Samples held, and pushed a second, under the fps meter; read once a second
let said = '', read = 0
function meter(now) {
  if (now - read < 1000) return
  const r = t2 > t1 ? fed * 1e3 / (t2 - t1) : 0, text = `${pretty(wf.length)} samples${r ? `\n+${pretty(+r.toPrecision(3))} /s` : ''}`
  if (text !== said) $('stats').textContent = said = text
  fed = t1 = t2 = 0; read = now
}

// ── sound ─────────────────────────────────────────────────────────────────

// ?source= picks the first: a recording, drawn at once, or a stream, the mic or the hour
let current = ui.items[new URLSearchParams(location.search).get('source')] ?? ui.items.cello
async function start(it, go = true) {
  const id = ++task
  current = it; ui.show(it); audio.stop(); pause(); clip = null
  if (it.id === 'hour') { $('hint').hidden = true; return hour(id) }
  // numbers, one array or channel per column: drawn whole, the first channel
  if (numbers(it)) {
    try { const [d] = parse(await it.file.text(), /\.json$/i.test(it.file.name)); if (id === task) reset(1, d.length, d, top(d)) }
    catch (e) { ui.show(it, e.message) }
    return
  }
  if (whole(it)) { if (go) play(); return load(it, id) }
  try {
    reset(audio.context?.sampleRate ?? rate)
    await audio.start(it)
    if (audio.context.sampleRate !== rate) reset(audio.context.sampleRate)
  } catch (e) { audio.stop(); ui.show(it, e.message) }
}
$('play').onclick = () => {
  if (!whole(current)) return audio.element || audio.playing ? audio.toggle() : start(current)
  if (!clip && !loading) return start(current)
  node || want ? pause() : play()
}
$('file').accept = 'audio/*,.csv,.txt,.json'

requestAnimationFrame(function frame(now) {
  requestAnimationFrame(frame)
  meter(now)
  if (!dirty && !audio.playing && !node) return
  dirty = false
  const p = clip ? playhead() : null
  if (node) chase(p)
  const range = view.range(edge())
  wf.update({ range, amplitude: [-amp, amp] }).clear().render()
  rule(range, p)
  const el = audio.element
  ui.progress(clip ? p / clip.length : el && isFinite(el.duration) ? el.currentTime / el.duration : got)
})

layout()
whole(current) || current.id === 'hour' ? start(current, false) : ui.show(current)
document.fonts?.ready.then(() => dirty = true)
