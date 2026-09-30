// A synthetic voice: syllables of a gliding voiced tone with breath noise, grouped into words and sentences.
// voice(seed) returns fill(out, from, to), which continues where the last call ended.
export default function voice(seed, rate = 48000) {
  let s = Math.imul(seed, 2654435761) | 0 || 1
  const rnd = () => (s ^= s << 13, s ^= s >>> 17, s ^= s << 5, (s >>> 0) / 4294967296)
  const T = 4096, sine = Float32Array.from({ length: T }, (_, i) => Math.sin(2 * Math.PI * i / T)), pitch = 95 + rnd() * 70
  let left = 0, len = 1, voiced = false, sylls = 0, words = 0, gain = 0, f = 0, df = 0, breath = 0, ph = 0
  const segment = () => {
    if (voiced) len = --sylls > 0 ? .01 + rnd() * .03 : --words > 0 ? .06 + rnd() * .12 : .35 + rnd() * .8
    else {
      if (sylls <= 0) { if (words <= 0) words = 3 + (rnd() * 10 | 0); sylls = 1 + (rnd() * 4 | 0) }
      len = .07 + rnd() * .16
      gain = .12 + rnd() ** 2 * .6
      f = pitch * (.85 + rnd() * .35); df = f * (rnd() - .6) * .3
      breath = rnd() < .2 ? .6 + rnd() * .3 : rnd() * .15
    }
    voiced = !voiced
    left = len = Math.max(1, Math.round(len * rate))
  }
  // per segment, state lives in locals: r is xorshift noise in ±2³¹, k the position in the segment
  return (out, a, b) => {
    for (let i = a; i < b;) {
      if (!left) segment()
      let e = Math.min(b, i + left), r = s, k = len - left
      left -= e - i
      if (!voiced) for (; i < e; i++) { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; out[i] = r * 1.4e-12 }
      else {
        let p = ph, g = gain, w = 1 - breath, z = breath * 4.66e-10, dp = f * T / rate, ddp = df * T / rate / len, u = T / 2 / len
        for (; i < e; i++, k++) {
          r ^= r << 13; r ^= r >>> 17; r ^= r << 5
          let v = sine[k * u | 0], q = p | 0
          p += dp + ddp * k
          if (p >= T) p -= T
          out[i] = g * v * v * ((sine[q] * .6 + sine[q * 2 & T - 1] * .3 + sine[q * 3 & T - 1] * .12) * w + r * z) + r * 1.4e-12
        }
        ph = p
      }
      s = r
    }
  }
}
