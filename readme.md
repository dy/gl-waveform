# waveform

Display time-domain samples with highest performance.

[![npm i @a-vis/waveform](https://nodei.co/npm/@a-vis/waveform.png?mini=true)](https://npmjs.org/package/@a-vis/waveform/)

```js
let wf = require('@a-vis/waveform')()

wf.render({
	data: fetch('./src'),
	color: 'gray',
	amplitude: [-1.2, 1.2],
	range: [0, 44100]
})

wf.render({
	append: newData
})
```


### See also

* [audio-waveform](https://github.com/a-vis/audio-waveform) − audio signals specific waveform renderer.
