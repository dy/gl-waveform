// Real sound for the demos: recordings and live radio served with CORS, so their samples can be read, and the microphone.
// The same file in gl-waveform, gl-spectrogram and gl-spectrum.

const commons = (path, file) => ({ url: `https://upload.wikimedia.org/wikipedia/commons/transcoded/${path}/${file}/${file}.mp3`, page: `https://commons.wikimedia.org/wiki/File:${file}` })

// Wikimedia Commons, MP3 transcodes so every browser decodes them; CC BY and BY-SA ask for the credit shown with them
export const recordings = [
  { id: 'cello', name: 'Bach – Cello Suite No. 1, Prélude', credit: 'John Michel', license: 'CC BY-SA 3.0', ...commons('4/43', 'JOHN_MICHEL_CELLO-J_S_BACH_CELLO_SUITE_1_in_G_Prelude.ogg') },
  { id: 'nocturne', name: 'Chopin – Nocturne Op. 15 No. 1', credit: 'Musopen', license: 'CC0', ...commons('5/56', 'Chopin_-_Nocturne_Op._15_no._1_in_F_major.ogg') },
  { id: 'spring', name: 'Vivaldi – Spring, Allegro', credit: 'John Harrison and the Wichita State University Chamber Players', license: 'CC BY-SA 4.0', ...commons('f/ff', 'Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga') },
  { id: 'egmont', name: 'Beethoven – Egmont Overture', credit: 'Musopen Symphony', license: 'Public domain', ...commons('8/85', 'Beethoven_-_Egmont_Overture%2C_Op._84_%28Musopen_Symphony%29.flac') },
  { id: 'blackbird', name: 'Blackbird singing', credit: 'Diana Tudor, xeno-canto', license: 'CC BY 4.0', ...commons('3/30', 'Common_Blackbird_song_%28Turdus_merula%29.ogg') },
  { id: 'highwayman', name: 'Noyes – The Highwayman, read aloud', credit: 'Maria Falin, LibriVox', license: 'Public domain', ...commons('4/4c', 'Highwayman_noyes_mf.ogg') }
]

// Live radio whose servers allow reading the samples
export const streams = [
  { id: 'wqxr', name: 'WQXR, classical radio', url: 'https://stream.wqxr.org/wqxr', page: 'https://www.wqxr.org' },
  { id: 'paradise', name: 'Radio Paradise, mellow mix', url: 'https://stream.radioparadise.com/mellow-128', page: 'https://radioparadise.com' }
]

/** The file at url as a Blob, reporting the share received, 0..1, as it arrives */
export async function download(url, progress) {
  const res = await fetch(url)
  if (!res.ok) throw Error(`${res.status} ${res.statusText}`)
  const total = +res.headers.get('content-length'), reader = res.body.getReader(), parts = []
  for (let got = 0; ;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value); got += value.length
    if (total) progress?.(got / total)
  }
  return new Blob(parts, { type: res.headers.get('content-type') || 'audio/mpeg' })
}

// Collects each channel in blocks of 2048 frames and hands them to the page
const TAP = `registerProcessor('tap', class extends AudioWorkletProcessor {
  process([input]) {
    if (!input.length) return true
    if (!this.buf) { this.buf = input.map(() => new Float32Array(2048)); this.n = 0 }
    input.forEach((ch, c) => this.buf[c]?.set(ch, this.n))
    if ((this.n += input[0].length) >= 2048) { this.port.postMessage(this.buf, this.buf.map(b => b.buffer)); this.buf = null }
    return true
  }
})`

/** Samples of a live input as they come: a MediaStream (the microphone) or a media element (radio, with crossOrigin set).
 *  onChunk gets an array of Float32Array, one per channel. Elements are heard; the microphone is not, to avoid feedback.
 *  Call it from a click, so the browser lets the audio start. */
export async function capture(input, onChunk, channels = 2) {
  const context = new AudioContext(), url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))
  try { await context.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
  const source = input instanceof MediaStream ? context.createMediaStreamSource(input) : context.createMediaElementSource(input)
  const tap = new AudioWorkletNode(context, 'tap', { channelCount: channels, channelCountMode: 'explicit' }), mute = context.createGain()
  mute.gain.value = 0
  source.connect(tap).connect(mute).connect(context.destination)
  if (!(input instanceof MediaStream)) source.connect(context.destination)
  tap.port.onmessage = e => onChunk(e.data)
  await context.resume()
  return { rate: context.sampleRate, stop() { tap.port.onmessage = null; source.disconnect(); context.close() } }
}

/** The microphone, captured: { rate, stop() } */
export async function record(onChunk) {
  const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  try {
    const tap = await capture(media, onChunk, 1)
    return { rate: tap.rate, stop() { tap.stop(); media.getTracks().forEach(t => t.stop()) } }
  } catch (e) { media.getTracks().forEach(t => t.stop()); throw e }
}

/** A live stream, heard and captured: { rate, stop() } */
export async function listen(url, onChunk) {
  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.src = url
  const tap = await capture(audio, onChunk)
  try { await audio.play() } catch (e) { tap.stop(); throw e }
  return { rate: tap.rate, stop() { audio.pause(); audio.removeAttribute('src'); audio.load(); tap.stop() } }
}
