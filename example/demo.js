import Waveform from '../index.js'
import { generator, parse } from './data.js'
import { recordings, streams, download, listen as radio, record } from './sources.js'
import { $, css, num, clamp, error, frame, step, label, setup, decode } from './ui.js'

const canvas = $('chart'), ax = $('axes').getContext('2d'), grid = $('grid').getContext('2d'), player = $('player')
const LEFT = 44, TOP = 24, GAP = 8, COLORS = ['#79c6ed', '#87c6a5', '#d5b47b', '#bf9de4', '#e7a597', '#87c6a5', '#b8bceb', '#e1d2b5']
let lanes = [], names = [], colors = [], bounds = [Infinity, -Infinity], gen, range = [0, 8192], amplitude = [-1.25, 1.25]
let indexed = 0, loading = false, baseCount = 0, streamStart = 0, streamed = 0, frames = [], cost = 0, reported = 0, paint = true
let w = 1, h = 1, pr = 1, pw = 1, lh = 1, dirty = true, running = false, last = 0, task = 0, title = '', source = 'voice'
let live = null, taken = [], url = null // the live capture and its chunks per channel, to play back once stopped; the audio heard
const cache = new Map() // recordings already decoded
const signal = () => !!$('source').querySelector(`[label=Signals] [value="${source}"]`)
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
function status() {
  const count = document.createElement('b'); count.textContent = `${label(lanes[0]?.length || 0)} samples`
  $('status').replaceChildren(`${title}  ${names.length} ${names.length === 1 ? 'trace' : 'traces'}  `, count, loading ? '…' : live ? '  live' : indexed === indexed ? `  indexed ${Math.round(indexed)} ms` : '')
}
function notice(text = '') { $('note').value = text; $('note').hidden = !text }
function credit(info) {
  $('credit').hidden = !info
  if (!info) return
  $('credit').href = info.page; $('credit').textContent = info.credit ? `${info.credit} · ${info.license}` : new URL(info.page).hostname
}
// Sound to hear: a recording, an audio file or a recorded take, with a playhead
function audio(blob) {
  release(); player.src = url = URL.createObjectURL(blob)
  $('play').hidden = $('seek').hidden = false; $('seek').value = 0
}
function release() {
  player.pause(); player.removeAttribute('src'); player.load(); if (url) URL.revokeObjectURL(url); url = null
  $('play').hidden = $('seek').hidden = $('playhead').hidden = true; $('play').textContent = 'Play'
}
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
function install(labels, heading, data, count = data[0].length) {
  stop(); loading = false
  const fresh = []
  try { const start = performance.now(); labels.forEach((_, i) => fresh.push(new Waveform(canvas, data ? { data: data[i] } : {}))); indexed = performance.now() - start }
  catch (e) { fresh.forEach(wf => wf.destroy()); throw e }
  lanes.forEach(wf => wf.destroy()); lanes = fresh; names = labels; title = heading
  bounds = [Infinity, -Infinity]
  if (source === 'voice') bounds = [num('offset') - num('magnitude'), num('offset') + num('magnitude')]
  else if (data) include(data)
  const gl = lanes[0].gl; gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT)
  colors = labels.map((_, i) => COLORS[signal() && source !== 'voice' ? i % COLORS.length : 0]); $('colors').replaceChildren()
  labels.forEach((name, i) => {
    const label = document.createElement('label'), input = document.createElement('input')
    label.textContent = name; input.type = 'color'; input.value = colors[i]; input.setAttribute('aria-label', `${name} color`)
    input.oninput = () => { colors[i] = input.value; paint = dirty = true }
    label.append(input); $('colors').append(label)
  })
  $('generator').disabled = $('streaming').disabled = $('stream').disabled = !signal()
  $('cycles').disabled = source !== 'osc' && source !== 'steps' && source !== 'gaps'
  baseCount = count
  for (const id of ['spike', 'clip', 'silence']) $(id).hidden = source !== 'voice'
  value(0, count); fitValues(); layout(); status(); error(''); notice(); paint = true
}
// Channels that are all the same, as in a mono recording published as stereo, draw as one
const distinct = data => data.filter((d, c) => !c || d.some((v, i) => v !== data[0][i]))
const channels = n => n === 2 ? ['Left', 'Right'] : n === 1 ? ['Mono'] : Array.from({ length: n }, (_, i) => `Channel ${i + 1}`)
function timed(rate) { $('rate').value = rate; $('units').value = 'time'; $('rate-row').hidden = false }
// Live chunks onto the lanes, the view following the end
function take(chunk) {
  if (!live) return
  if (length() + chunk[0].length > num('rate') * 600) { stopLive(); return error('Ten minutes recorded. Choose a source to start again.') }
  lanes.forEach((wf, i) => { const c = chunk[Math.min(i, chunk.length - 1)]; wf.push(c); taken[i].push(c) })
  if ($('follow').checked) { const n = length(), span = range[1] - range[0]; value(n > span ? n - span : 0, n > span ? n : span) }
  dirty = true
}
// Stopped, the take plays back like a recording
function stopLive() {
  if (!live) return
  live.stop(); live = null; indexed = NaN // pushed as it came, never indexed at once
  const n = lanes[0].length, mix = new Float32Array(n)
  taken.forEach(chunks => { let at = 0; for (const c of chunks) { for (let i = 0; i < c.length; i++) mix[at + i] += c[i] / taken.length; at += c.length } })
  taken = []
  if (n) audio(wav(mix, num('rate'))); else release()
  status()
}
function wav(data, sr) {
  const bytes = new ArrayBuffer(44 + data.length * 2), v = new DataView(bytes)
  const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, clamp(data[i], -1, 1) * 32767, true)
  return new Blob([bytes], { type: 'audio/wav' })
}
// A recording (downloaded once), live radio, the microphone or a generated signal
async function choose() {
  const picked = $('source').value, rec = recordings.find(r => r.id === picked), station = streams.find(s => s.id === picked)
  if (picked === 'file') return
  stopLive(); release(); credit()
  if (!rec && !station && picked !== 'mic') {
    $('units').value = picked === 'voice' ? 'time' : 'samples'; $('rate-row').hidden = $('units').value !== 'time'
    return generate()
  }
  const id = ++task, name = $('source').selectedOptions[0].textContent
  stop(); error('')
  try {
    if (rec) {
      let got = cache.get(picked)
      if (!got) {
        notice(`Downloading ${name}…`)
        const blob = await download(rec.url, p => { if (id === task) notice(`Downloading ${name}  ${Math.round(p * 100)}%`) })
        if (id !== task) return
        notice(`Decoding ${name}…`)
        const { data, rate } = await decode(blob)
        cache.set(picked, got = { data: distinct(data), rate, blob })
      }
      if (id !== task) return
      source = picked; timed(got.rate)
      install(channels(got.data.length), name, got.data); audio(got.blob); credit(rec)
    } else {
      notice(station ? `Tuning in to ${name}…` : 'Waiting for the microphone…')
      const tap = await (station ? radio(station.url, take) : record(take)), n = station ? 2 : 1
      if (id !== task) return tap.stop()
      source = picked; timed(tap.rate)
      install(channels(n), name, Array.from({ length: n }, () => new Float32Array(0)), 0)
      live = tap; taken = lanes.map(() => []); value(0, tap.rate * 8); credit(station); status()
      $('play').hidden = false; $('play').textContent = 'Stop'
    }
    $('source').querySelector('[value=file]').hidden = true
  } catch (e) { if (id === task) { notice(); error(`${name}: ${e.message}`); status() } }
}
// Generated signals load as a stream: each frame pushes the next block, so the picture fills in and the count runs up.
async function generate() {
  const id = ++task; stop(); const nextSource = $('source').value
  if (nextSource === 'file') return
  const opts = Object.fromEntries(['cycles', 'count', 'magnitude', 'offset', 'rate'].map(key => [key, num(key)]))
  try {
    source = nextSource; gen = generator(source, opts)
    $('source').querySelector('[value=file]').hidden = true
    install(gen.names, $('source').selectedOptions[0].textContent, null, opts.count)
    loading = true; indexed = 0; $('stream').disabled = true
    for (let a = 0; a < opts.count; a += 1048576) {
      const blocks = gen.next(Math.min(1048576, opts.count - a)), start = performance.now()
      lanes.forEach((wf, c) => wf.push(blocks[c])); indexed += performance.now() - start
      if (source !== 'voice') { include(blocks); fitValues() }
      dirty = true; status()
      await frame(); if (id !== task) return
    }
    loading = false; status(); $('stream').disabled = false
  } catch (e) { if (id === task) { loading = false; error(e.message); status() } }
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
$('source').prepend(...[['Recordings', recordings], ['Live', [...streams, { id: 'mic', name: 'Microphone' }]]].map(([label, list]) => {
  const group = document.createElement('optgroup')
  group.label = label
  group.append(...list.map(s => new Option(s.name, s.id)))
  return group
}))
$('source').onchange = choose
$('play').onclick = () => live ? stopLive() : player.paused ? player.play().catch(e => error(e.message)) : player.pause()
for (const event of ['play', 'pause', 'ended']) player.addEventListener(event, () => { if (!live) $('play').textContent = player.paused ? 'Play' : 'Pause' })
player.addEventListener('timeupdate', () => { if (Number.isFinite(player.duration)) $('seek').value = player.currentTime / player.duration * 1000 })
$('seek').oninput = () => { if (Number.isFinite(player.duration)) player.currentTime = num('seek') / 1000 * player.duration }
window.addEventListener('pagehide', () => { stopLive(); release() })
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
$('controls').onreset = () => { queueMicrotask(() => { $('source').value = 'voice'; document.documentElement.style.removeProperty('--plot-bg'); $('rate-row').hidden = false; $('thickness-value').value = '1.5 px'; $('opacity-value').value = '90%'; choose() }) }
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return
  const id = ++task; stop(); stopLive(); $('status').value = `Opening ${file.name}…`
  try {
    const numeric = /\.(json|csv|txt)$/i.test(file.name)
    const result = numeric ? { data: parse(await file.text(), /\.json$/i.test(file.name)) } : await decode(file)
    if (id !== task) return
    if (result.data.length > 8) throw Error('Open a file with at most 8 channels.')
    source = 'file'; $('source').value = 'file'; $('source').querySelector('[value=file]').hidden = false
    release(); credit()
    if (result.rate) timed(result.rate)
    else { $('units').value = 'samples'; $('rate-row').hidden = true }
    install(result.data.map((_, i) => `Channel ${i + 1}`), file.name, result.data)
    if (result.rate) audio(file)
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
  if (url && lanes.length) {
    // the playhead, the view paging along with it
    const pos = player.currentTime * num('rate'), span = range[1] - range[0]
    if (!player.paused && $('follow').checked && (pos > range[1] || pos < range[0])) value(pos, pos + span)
    const x = LEFT + (pos - range[0]) / span * pw
    $('playhead').hidden = player.paused || x < LEFT || x > LEFT + pw; $('playhead').style.left = x + 'px'; $('playhead').style.top = TOP + 'px'
  }
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
// ?source= picks the first source: a recording, a stream, mic or a signal
const asked = params.get('source')
if ($('source').querySelector(`option[value="${CSS.escape(asked ?? '')}"]`)) $('source').value = asked
await choose()
