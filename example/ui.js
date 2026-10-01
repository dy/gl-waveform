// Native controls; no build step.
export const $ = id => document.getElementById(id)
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
export const num = id => +$(id).value
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
export const error = message => { $('error').textContent = message; $('error').hidden = !message }
export const frame = () => new Promise(requestAnimationFrame)
export function step(span, pixels) {
  const raw = span / Math.max(1, pixels / 90), exp = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].find(n => n * exp >= raw) * exp
}
export const label = n => (Number.isInteger(n) ? n : Number(n.toPrecision(6))).toLocaleString('en-US', { maximumFractionDigits: 6 })
export function setup({ resize, zoom, pan, fit, inspect, wheel }) {
  const canvas = $('chart'), plot = $('plot'), pointers = new Map()
  const observer = new ResizeObserver(() => {
    const { width, height } = plot.getBoundingClientRect(), pr = devicePixelRatio
    for (const c of plot.querySelectorAll('canvas')) { c.width = Math.round(width * pr); c.height = Math.round(height * pr) }
    resize(width, height, pr)
  })
  try { observer.observe(plot, { box: 'device-pixel-content-box' }) } catch { observer.observe(plot) }
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    const delta = (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientWidth : 1)
    if (wheel?.(e, delta)) return
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) pan((e.deltaX || e.deltaY) * delta)
    else zoom(e.offsetX, Math.exp(clamp(e.deltaY * delta * (e.ctrlKey ? .01 : .002), -2, 2)))
  }, { passive: false })
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e.offsetX); canvas.classList.add('drag')
  })
  canvas.addEventListener('pointermove', e => {
    inspect(e.offsetX, e.offsetY)
    if (!pointers.has(e.pointerId)) return
    const prev = pointers.get(e.pointerId)
    if (pointers.size === 1) pan(prev - e.offsetX)
    else {
      const other = [...pointers].find(([id]) => id !== e.pointerId)[1]
      if (Math.abs(e.offsetX - other) > 10 && Math.abs(prev - other) > 10) zoom((e.offsetX + other) / 2, Math.abs(prev - other) / Math.abs(e.offsetX - other))
    }
    pointers.set(e.pointerId, e.offsetX)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => {
    pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('drag')
  })
  canvas.addEventListener('pointerleave', () => inspect(-1, -1))
  canvas.addEventListener('dblclick', fit)
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Home') fit()
    else if (e.key === '+' || e.key === '=') zoom(canvas.clientWidth / 2, .5)
    else if (e.key === '-') zoom(canvas.clientWidth / 2, 2)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') pan((e.key === 'ArrowLeft' ? -1 : 1) * canvas.clientWidth / 10)
    else return
    e.preventDefault()
  })
  $('fit').onclick = fit
  $('zoom-in').onclick = () => zoom(canvas.clientWidth / 2, .5)
  $('zoom-out').onclick = () => zoom(canvas.clientWidth / 2, 2)
  function settings(open) {
    $('panel').hidden = !open
    $('settings').setAttribute('aria-expanded', String(open))
    if (!open) $('settings').focus()
  }
  $('settings').onclick = () => settings($('panel').hidden)
  $('close-settings').onclick = () => settings(false)
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('panel').hidden) settings(false) })
  $('controls').onsubmit = e => e.preventDefault()
  $('controls').addEventListener('change', e => { if (e.target.type === 'number') e.target.reportValidity() })
  $('open').onclick = () => $('file').click()
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); error('Graphics context lost. Waiting for the browser to restore it…') })
  canvas.addEventListener('webglcontextrestored', () => { error(''); fit() })
}
export async function decode(file) {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    return { data: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), rate: buffer.sampleRate }
  } finally { await context.close() }
}
