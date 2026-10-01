import voice from './voice.js'

export function generator(source, { cycles = 8, count = 8192, magnitude = 1, offset = 0, rate = 48000 } = {}) {
  let pos = 0, seed = 1, walk = 0
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32 * 2 - 1 }
  const voices = [voice(1, rate), voice(2, rate)]
  const names = source === 'osc' ? ['Sine', 'Saw', 'Triangle'] : source === 'voice' ? ['Left', 'Right'] : [{ noise: 'Noise', walk: 'Random walk', steps: 'Steps', gaps: 'Gaps & spikes' }[source]]
  return { names, next(n) {
    const data = names.map(() => new Float32Array(n))
    if (source === 'voice') {
      voices.forEach((fill, c) => fill(data[c], 0, n))
      // The original long-waveform landmarks, stable across streaming blocks.
      for (const d of data) {
        for (const [a, b] of [[.083, .0863], [.308, .3122], [.55, .5555], [.87, .8722]]) {
          const from = Math.max(0, Math.round(a * count) - pos), to = Math.min(n, Math.round(b * count) - pos)
          if (from < to) d.fill(0, from, to)
        }
        for (let i = Math.max(0, Math.round(.667 * count) - pos), end = Math.min(n, Math.round(.692 * count) - pos); i < end; i++) d[i] = Math.max(-1, Math.min(1, d[i] * 4))
      }
      const spike = Math.round((Math.round(.308 * count) + Math.round(.3122 * count)) / 2) - pos
      if (spike >= 0 && spike < n) data[0][spike] = .9
      if (magnitude !== 1 || offset !== 0) for (const d of data) for (let i = 0; i < n; i++) d[i] = d[i] * magnitude + offset
      pos += n
      return data
    }
    for (let i = 0; i < n; i++, pos++) {
      const phase = (pos * cycles / count) % 1
      if (source === 'osc') { data[0][i] = Math.sin(phase * Math.PI * 2); data[1][i] = phase * 2 - 1; data[2][i] = 1 - 4 * Math.abs(phase - .5) }
      else if (source === 'noise') data[0][i] = rnd()
      else if (source === 'walk') data[0][i] = walk = walk * .997 + rnd() * .06
      else if (source === 'steps') data[0][i] = Math.floor(phase * 5) / 2 - 1
      else if (source === 'gaps') data[0][i] = pos % count === Math.floor(count * .7) ? 2 : phase > .3 && phase < .5 ? NaN : Math.sin(phase * Math.PI * 2) * .35
      for (const d of data) d[i] = d[i] * magnitude + offset
    }
    return data
  } }
}

// JSON: an array or an array of channels. CSV/text: a number per row or one channel per column.
export function parse(text, json = false) {
  let columns
  if (json) {
    const value = JSON.parse(text)
    if (!Array.isArray(value)) throw Error('Use a JSON array of numbers, or an array of channels.')
    columns = Array.isArray(value[0]) ? value : [value]
  } else {
    if (!text.trim()) throw Error('The file contains no samples.')
    const rows = text.trim().split(/\r?\n/).map(row => {
      const line = row.trim()
      return line.split(/[,;]/.test(line) ? /[,;]/ : line.includes('\t') ? /\t/ : / +/).map(v => v.trim())
    })
    columns = rows.length === 1 ? [rows[0]] : Array.from({ length: rows[0].length }, (_, c) => rows.map(row => row[c]))
    if (rows.some(row => row.length !== rows[0].length)) throw Error('Each row must have the same number of columns.')
  }
  if (!columns.length || columns.length > 8 || !columns[0].length || columns.some(c => !Array.isArray(c) || c.length !== columns[0].length)) throw Error('Use 1–8 channels with the same number of samples.')
  return columns.map(column => Float32Array.from(column, value => {
    if (value === null || value === '' || value === 'NaN') return NaN
    if (typeof value !== 'number' && typeof value !== 'string') throw Error('Samples must be numbers; use null for a gap.')
    const n = Number(value)
    if (!Number.isFinite(n) || Math.abs(n) > 3.4e38) throw Error('Samples must be finite numbers; use null or NaN for a gap.')
    return n
  }))
}
