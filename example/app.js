// The demos' shell, the same file in gl-waveform, gl-spectrogram and gl-spectrum: gl-spectrum v3's page (app-audio's
// source picker, fps-indicator, settings-panel's typer theme, random palettes), the sound, and pointer gestures.
import { recordings, streams, tap } from './sources.js'

export const $ = id => document.getElementById(id)
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

// The libraries v3 used, from esm.sh, loaded behind the page: till they come, or if they fail, it goes on without them
export const esm = (name, fallback) => import(`https://esm.sh/${name}`).then(m => m.default ?? m, () => fallback)

// ── colors: [r, g, b] 0..255 with a 0..1 ────────────────────────────────────

const probe = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
export function parse(c) {
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#0000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return a ? [r * 255 / a, g * 255 / a, b * 255 / a, a / 255] : [0, 0, 0, 0]
}
export const css = ([r, g, b, a = 1]) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${+a.toFixed(3)})`
export const unit = c => [c[0] / 255, c[1] / 255, c[2] / 255, c[3]]
export const alpha = (c, a) => [c[0], c[1], c[2], c[3] * a]
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
// color-interpolate: stops evenly over 0..1, mixed in sRGB
export const ramp = stops => t => {
  if (stops.length < 2) return stops[0]
  const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2)
  return mix(stops[i], stops[i + 1], x - i)
}
// WCAG 2 relative luminance and contrast
export const lum = c => c.slice(0, 3).map(v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

// v3's palettes: nice-color-palettes and every colormap scale at 16 shades, kept where the first and last colors read as
// large text (tinycolor's AA, WCAG's 3:1 without it). A few readable ones stand in till they load
const readable = (a, b) => contrast(parse(a), parse(b)) >= 3
let palettes = [['#ecd078', '#d95b43', '#c02942', '#542437', '#53777a'], ['#e8ddcb', '#cdb380', '#036564', '#033649', '#031634'], ['#490a3d', '#bd1550', '#e97f02', '#f8ca00', '#8a9b0f']]
Promise.all([esm('nice-color-palettes@1.0.1'), esm('colormap@2.3.2'), esm('colormap@2.3.2/colorScale.js', {}), esm('tinycolor2@1.6.0')]).then(([nice, colormap, colorScale, tinycolor]) => {
  const all = [...nice ?? []]
  if (colormap) for (const name in colorScale) {
    if (['alpha', 'hsv', 'rainbow', 'rainbow-soft', 'phase'].includes(name)) continue
    try { all.push(colormap({ colormap: colorScale[name], nshades: 16, format: 'rgbaString' })) } catch {}
  }
  const ok = tinycolor ? (a, b) => tinycolor.isReadable(a, b, { level: 'AA', size: 'large' }) : readable
  if (all.length) palettes = all.filter(p => ok(p[0], p.at(-1)))
})

// typer's tones on the settings panel: its palette from text (0) to panel (1)
function theme(stops) {
  const tone = ramp(stops), byLum = stops.toSorted((a, b) => lum(a) - lum(b))
  const light = mix([255, 255, 255, 1], byLum.at(-1), .25), shade = mix([0, 0, 0, 1], byLum[0], .25)
  const inversed = lum(stops[0]) > lum(stops.at(-1)), bg = tone(.9), fg = tone(.08)
  const panel = $('panel').style, set = (k, c) => panel.setProperty(k, css(c))
  set('--t0', tone(0)); set('--t08', fg); set('--t25', tone(.25)); set('--t9', bg)
  set('--sel', tone(.855)); set('--sel-hi', tone(.855 + (inversed ? -.07 : .07))); set('--box', tone(.915)); set('--box-on', tone(.93))
  set('--light', light); set('--shade', shade); set('--link', alpha(tone(0), .1))
  panel.setProperty('--check', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${css(fg)}" stroke="${css(fg)}" stroke-width="1.2" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`)}")`)
}

/** v3's setColors: the page takes the palette's last color, the picture runs from it to the first. Calls onColors with
 *  { color(t), flat }: color(0) is the page, color(1) the ink, as [r, g, b, a] */
export function palette(onColors, start = ['black'], active = '#24D4C0') {
  const set = (p, active) => {
    // one color is ink on white
    const rgb = p.map(parse), flat = rgb.length < 2, color = ramp(flat ? [[255, 255, 255, 1], rgb[0]] : rgb.toReversed())
    const bg = color(0), ink = css(rgb[0])
    document.body.style.setProperty('--bg', css(bg))
    document.body.style.setProperty('--fg', ink)
    $('panel').style.backgroundColor = css(alpha(bg, .5))
    $('panel').style.boxShadow = `0 0 0 2px ${css(alpha(color(.5), .1))}`
    if (!flat) theme(rgb)
    ink0 = ink; if (fps) fps.element.style.color = ink
    $('swatch').replaceChildren(...[active, ...p].filter(Boolean).slice(0, 3).map(c => Object.assign(document.createElement('span'), { style: `background: ${c}` })))
    onColors({ color, flat })
  }
  $('swatch').onclick = () => {
    let p = palettes[Math.floor((palettes.length - 1) * Math.random())]
    if (Math.random() > .5) p = p.toReversed()
    set(p)
  }
  theme([[0, 0, 0, 1], [255, 255, 255, 1]])
  set(start, active)
}

let fps, ink0 = ''
esm('fps-indicator@1.3.0').then(create => {
  fps = create?.({ position: 'top-right', css: { fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: '12px', padding: 0, marginTop: '1rem', marginRight: '1rem' } })
  if (fps) fps.element.style.color = ink0
})

// ── the source picker, as app-audio ───────────────────────────────────────

const PLAY = 'M213.308 291.971c0-29.549 23.948-53.504 53.497-53.504 9.185 0 14.999 2.398 25.225 6.47l375.259 218.333c17.454 10.348 25.533 26.969 28.647 46.117v5.376c-3.122 19.144-11.203 35.769-28.647 46.117l-375.251 218.325c-10.245 4.080-16.055 6.462-25.225 6.462-29.549 0-53.497-23.955-53.497-53.504v-440.211z'
const PAUSE = 'M250 240h110v544h-110zM459 240h110v544h-110z'

/** The menu of sound: open a file, the microphone, the recordings, the radio, and any groups of the page's own as
 *  [title, [{ id, name }]]; pick(item) on a choice. Returns show(item, error), playing(bool), progress(0..1) */
export function picker(pick, groups = []) {
  const items = { mic: { id: 'mic', name: 'Microphone' } }
  for (const [title, list] of [['Recordings', recordings], ['Radio', streams.map(s => ({ ...s, live: true }))], ...groups]) {
    const ul = document.createElement('ul')
    ul.dataset.title = title
    for (const it of list) {
      items[it.id] = it
      const b = Object.assign(document.createElement('button'), { className: 'aa-item', textContent: it.name, title: it.name })
      b.dataset.id = it.id
      ul.append(document.createElement('li')); ul.lastChild.append(b)
    }
    $('sources').append(ul)
  }
  const choose = it => { $('source').open = false; pick(it) }
  $('sources').onclick = e => { const b = e.target.closest('[data-id]'); if (b) choose(items[b.dataset.id]) }
  $('open').onclick = () => $('file').click()
  $('file').onchange = () => {
    const f = $('file').files[0]
    if (f) choose({ id: 'file', name: f.name, url: URL.createObjectURL(f), file: f })
    $('file').value = ''
  }
  addEventListener('click', e => { if (!$('source').contains(e.target)) $('source').open = false })
  return {
    items,
    show(it, error) {
      $('title').textContent = error ? `Error: ${error}` : it.name
      $('source').classList.toggle('aa-error', !!error)
      const credit = it.credit ? `${it.credit}, ${it.license}` : it.page ? new URL(it.page).hostname : ''
      Object.assign($('credit'), { textContent: credit, href: it.page ?? '' }).hidden = !credit
    },
    playing(on) {
      $('play-icon').setAttribute('d', on ? PAUSE : PLAY)
      $('play').setAttribute('aria-label', on ? 'Pause' : 'Play')
    },
    progress(t) { $('progress').style.width = `${clamp(t, 0, 1) * 100}%` }
  }
}

// ── sound ─────────────────────────────────────────────────────────────────

/** Plays an item of the picker, or the microphone (not heard, to avoid feedback), through one AudioContext. With chunk,
 *  its samples as they sound, an array of Float32Array per channel; with fftSize, an AnalyserNode on it.
 *  start() must come from a click, so the browser lets the sound begin. */
export function sound({ chunk, fftSize, loop = false, state = () => {} } = {}) {
  let context, out, analyser, node, source, element, media, my = 0
  const api = {
    get context() { return context },
    get analyser() { return analyser },
    get element() { return element },
    get playing() { return !!(media || element && !element.paused) },
    async start(it) {
      const id = ++my
      api.stop()
      if (!context) {
        context = new AudioContext()
        out = context.createGain(); out.connect(context.destination)
        if (fftSize) analyser = Object.assign(context.createAnalyser(), { fftSize, smoothingTimeConstant: 0, minDecibels: -100, maxDecibels: 0 })
      }
      await context.resume()
      if (chunk && !node) node = await tap(context, c => { if (api.playing) chunk(c) })
      if (id !== my) return
      if (it.id === 'mic') {
        const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        if (id !== my) return m.getTracks().forEach(t => t.stop())
        media = m; source = context.createMediaStreamSource(m); out.gain.value = 0
      } else {
        const el = element = Object.assign(new Audio(), { crossOrigin: 'anonymous', loop: loop && !it.live, src: it.url })
        for (const type of ['playing', 'pause', 'ended']) el.addEventListener(type, () => { if (el === element) state(api.playing) })
        source = context.createMediaElementSource(el); out.gain.value = 1
      }
      source.connect(out)
      if (analyser) source.connect(analyser)
      if (node) source.connect(node)
      if (element) await element.play()
      state(api.playing)
    },
    toggle() {
      if (element) return element.paused ? element.play() : element.pause()
      api.stop()
    },
    stop() {
      source?.disconnect(); source = null
      if (element) { element.pause(); if (element.src.startsWith('blob:')) URL.revokeObjectURL(element.src); element.removeAttribute('src'); element.load(); element = null }
      media?.getTracks().forEach(t => t.stop()); media = null
      state(false)
    }
  }
  return api
}

// ── gestures ──────────────────────────────────────────────────────────────

/** Wheel, drag, pinch and keys on el, in CSS px from its corner: pan(dx, dy) moves the view by that much, as a drag;
 *  zoom(x, y, kx, ky) scales its span by kx across and ky down about (x, y), < 1 zooming in. Shift+wheel and a vertical
 *  pinch zoom down; a trackpad pinch arrives as ctrl+wheel. fit() on double click and Home. */
export function gestures(el, { pan, zoom, fit }) {
  const at = new Map()
  el.addEventListener('wheel', e => {
    e.preventDefault()
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1, d = (e.deltaY || e.deltaX) * k
    const f = Math.exp(clamp(d * (e.ctrlKey ? .01 : .002), -2, 2))
    if (e.shiftKey) zoom(e.offsetX, e.offsetY, 1, f)
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pan(-e.deltaX * k, 0)
    else zoom(e.offsetX, e.offsetY, f, 1)
  }, { passive: false })
  el.addEventListener('pointerdown', e => {
    if (e.button) return
    el.setPointerCapture(e.pointerId); at.set(e.pointerId, [e.offsetX, e.offsetY]); el.classList.add('drag')
  })
  el.addEventListener('pointermove', e => {
    const prev = at.get(e.pointerId)
    if (!prev) return
    const now = [e.offsetX, e.offsetY]
    if (at.size === 1) pan(now[0] - prev[0], now[1] - prev[1])
    else {
      // two fingers: the spread across and down, before and after, scales each axis
      const other = [...at].find(([id]) => id !== e.pointerId)[1], spread = (a, i) => Math.abs(a[i] - other[i])
      const kx = spread(prev, 0) > 24 && spread(now, 0) > 24 ? spread(prev, 0) / spread(now, 0) : 1
      const ky = spread(prev, 1) > 24 && spread(now, 1) > 24 ? spread(prev, 1) / spread(now, 1) : 1
      zoom((now[0] + other[0]) / 2, (now[1] + other[1]) / 2, kx, ky)
    }
    at.set(e.pointerId, now)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, e => {
    at.delete(e.pointerId); if (!at.size) el.classList.remove('drag')
  })
  el.addEventListener('dblclick', fit)
  el.addEventListener('keydown', e => {
    const w = el.clientWidth, h = el.clientHeight
    if (e.key === 'Home') fit()
    else if (e.key === '+' || e.key === '=') zoom(w / 2, h / 2, .5, 1)
    else if (e.key === '-') zoom(w / 2, h / 2, 2, 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') pan((e.key === 'ArrowLeft' ? 1 : -1) * w / 10, 0)
    else return
    e.preventDefault()
  })
}

/** A time view that follows the newest sample till dragged back, as a recorder: [from, to] in samples for edge, the
 *  newest. Zoomed while following, the right edge stays on the newest. */
export function timeline(span) {
  const t = {
    span, end: span, follow: true,
    range(edge) { if (t.follow) t.end = edge; return [t.end - t.span, t.end] },
    pan(ds, edge) { t.end = clamp(t.end + ds, Math.min(edge, t.span / 4), edge); t.follow = t.end >= edge },
    zoom(u, k, edge, max) {
      const s = clamp(t.span * k, 256, max)
      if (!t.follow) t.end = clamp(t.end - (1 - u) * (t.span - s), Math.min(edge, s / 4), edge)
      t.span = s; t.follow ||= t.end >= edge
    },
    fit(edge) { t.span = Math.max(edge, 256); t.end = edge; t.follow = true }
  }
  return t
}

// ── plot-grid ─────────────────────────────────────────────────────────────

// pretty-number: thousands apart by a narrow space
export const pretty = v => String(+v.toFixed(3)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
/** A 1-2-5 step of at least px pixels for span units over width pixels */
export function step(span, width, px = 60) {
  const raw = span / Math.max(1, width / px), e = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].find(m => m * e >= raw) * e
}
/** The grid canvas for this frame: cleared, scaled to CSS px, its font plot-grid's */
export function rules(canvas) {
  const g = canvas.getContext('2d'), pr = canvas.width / canvas.clientWidth
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height)
  g.setTransform(pr, 0, 0, pr, 0, 0)
  g.font = `10px ${getComputedStyle(document.body).fontFamily}`; g.textBaseline = 'bottom'
  return { g, px: 1 / pr }
}
