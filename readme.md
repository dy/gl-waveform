# gl-waveform [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Display time-domain samples with highest performance.

[![npm i gl-waveform](https://nodei.co/npm/gl-waveform.png?mini=true)](https://npmjs.org/package/gl-waveform/)

```js
const Waveform = require('gl-waveform')
let wf = new Waveform()

waveform.update({
	data: [0, .5, 1, .5, 0, -.5, -1, ...],
	color: 'gray',
	range: [0, 44100]
})

waveform.render()

waveform.update({
	append: newData
})

waveform.render()
```


### See also

* [audio-waveform](https://github.com/a-vis/audio-waveform) − extended waveform renderer for audio.
