// The v4 demos' dependencies at the major versions they used, from esm.sh; offline, a small local equivalent of each

// audio-oscillator: osc[shape](length | array, options | frequency), 440 Hz at 44.1 kHz, the phase carried on the array
const wave = f => (dst, o) => {
  if (typeof dst == 'number') dst = Array(dst)
  let t = dst.t ?? o?.t ?? 0, k = (typeof o == 'number' ? o : 440) / 44100
  for (let i = 0; i < dst.length; i++, t = (t + k) % 1) dst[i] = f(t)
  return dst.t = t, dst
}

const local = {
  osc: { sin: wave(t => Math.sin(2 * Math.PI * t)), saw: wave(t => 1 - 2 * t), tri: wave(t => 1 - 4 * Math.min(t, 1 - t)) },

  // pan-zoom: cb({ dx, dy, dz, x, y }) on drag and wheel, x and y relative to the element
  panzoom: (el, cb) => {
    let at = e => { let r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    el.addEventListener('wheel', e => (e.preventDefault(), cb({ dx: 0, dy: 0, dz: e.deltaY, ...at(e) })), { passive: false })
    el.addEventListener('pointermove', e => e.buttons && cb({ dx: e.movementX, dy: e.movementY, dz: 0, ...at(e) }))
  },

  // fps-indicator: frames per second, updated every second
  fps: ({ position = 'top-left', style = '' } = {}) => {
    let el = document.body.appendChild(document.createElement('div')), n = 0, t = performance.now()
    el.className = 'fps', el.innerHTML = '<span class="fps-text">fps <span class="fps-value">60.0</span></span>'
    el.style.cssText = `position: fixed; ${position.replace('-', ': 0; ')}: 0; padding: 1rem; font: 300 small Roboto, sans-serif; ${style}`
    requestAnimationFrame(function f(now) {
      if (++n, now - t > 1000) el.querySelector('.fps-value').textContent = (n * 1000 / (now - t)).toFixed(1), n = 0, t = now
      requestAnimationFrame(f)
    })
  },

  // prettysize: (bytes, nospace, one-letter unit) in powers of 1024, one decimal unless .0
  size: (n, nospace, one) => {
    let u = ['Bytes', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'], i = n < 1 ? 0 : Math.min(6, Math.floor(Math.log2(n) / 10))
    return (n / 1024 ** i).toFixed(1).replace(/\.0$/, '') + (nospace ? '' : ' ') + (one ? u[i][0] : u[i])
  }
}

const load = (name, k) => import('https://esm.sh/' + name).then(m => m.default, () => local[k])

export const [osc, panzoom, fps, size] = await Promise.all([
  load('audio-oscillator@3', 'osc'), load('pan-zoom@3', 'panzoom'), load('fps-indicator@1', 'fps'), load('prettysize@1', 'size')
])
