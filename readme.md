# gl-waveform [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Visualise waveform data in webgl or canvas2d.

[![Waveform](https://raw.githubusercontent.com/audio-lab/gl-waveform/gh-pages/preview.png "Waveform")](http://audio-lab.github.io/gl-waveform/)


## Usage

[![npm install gl-waveform](https://nodei.co/npm/gl-waveform.png?mini=true)](https://npmjs.org/package/gl-waveform/)

```js
const createWaveform = require('gl-waveform');

let wf = createWaveform({
	container: '.audio-container',
	samples: audio.getFloatTimeDomainData(),
	width: 44100
});

//update waveform data each 50ms
setTimeout(() => {
	wf.push(newData);
}, 50);
```

[**`See in action`**](TODO requirebin)

## API

<details><summary>**`const Waveform = require('gl-waveform');`**</summary>

Get waveform component class. `require('gl-waveform/2d')` for canvas-2d version.

</details>
<details><summary>**`let waveform = new Waveform(options);`**</summary>

Create waveform instance based off options:

```js
//container to place waveform element
container: document.body,

//waveform data, floats from -1..1 range
samples: timeDomainData,

//audio viewport settings
maxDecibels: -30,
minDecibels: -100,
sampleRate: 44100,

//how many samples fit to the full canvas width, i. e. 44100 for 1s of data
width: 1024,

//how many samples to skip from the left side of the buffer.
//undefined offset will move window to the tail of data, negative - from the tail.
offset: null,

//render line or fill
type: 'line',

//draw amplitude grid
grid: true,

//place lines in logarithmic fashion, which makes contrast of peaks
log: true,

//use db units or 0..1 range
db: true,

// List of colors to dye the data in, i. e. colormap
palette: ['white', 'black'],

//webgl-context options, or existing context instance
context: {
	antialias: false,
	width: 400,
	height: 200,
	canvas: canvas
}
```

</details>
<details><summary>**`waveform.push(data)`**</summary>

Add the new data for the waveform to buffer. Data is treated as float values from `0..1` range therefore it can be an _Array_, _FloatArray_ or any other collection. The visible slice is

</details>
<details><summary>**`waveform.update(options?)`**</summary>

Update options, if required. Like, palette, grid type etc.

</details>

## Credits

> [Drawing waveforms](http://www.supermegaultragroovy.com/2009/10/06/drawing-waveforms/) — some insights on the way to draw waveforms.<br/>

## Related

> [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram) — spectrogram painter for any signal.<br/>
> [gl-spectrum](https://github.com/audio-lab/gl-spectrum) — nice-looking signal spectrum visualiser for.<br/>
> [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.<br/>
> [waveform-data](https://www.npmjs.com/package/waveform-data) - similar waveform drawing component.<br/>