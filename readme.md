# gl-waveform [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

High-performant waveform rendering component in webgl or canvas2d.

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

//update waveform data after 50ms
setTimeout(() => {
	wf.set(newData);
}, 50);
```

<!-- [**`See in action`**](TODO requirebin) -->

## API

### `const Waveform = require('gl-waveform')`

Get waveform component class. `require('gl-waveform/2d')` for canvas-2d version.

### `let waveform = new Waveform(options)`

Create waveform instance based off options:

```js
// Container to place waveform element
container: document.body,

// Webgl context, will be created by default
context: null,

// Audio viewport params
maxDb: -0,
minDb: -100,
sampleRate: 44100,

// Zoom level, or how many data samples per pixel
scale: 1,

// How many samples to skip from the left side of the buffer.
//undefined offset will move window to the tail of data, negative - from the tail.
offset: null,

// Place data in logarithmic fashion, which makes feeble data more contrast
log: true,

// Colormap for the data
palette: ['white', 'black'],

// Fill background with the color
background: null,

// Enable alpha to make transparent canvas
alpha: false,

// Draw automatically every frame or only when data/options changes
autostart: false,

// Worker mode, a bit heavy for main thread to sample huge waveforms
worker: true,

// Pixel ratio
pixelRatio: window.pixelRatio,

// Enable panning/zooming by dragging/scrolling
pan: true,
zoom: true
```

### `waveform.push(data, cb?)`

Append new data to the waveform. Data is whether single sample or array/float array with values from `0..1` range.
The visible waveform will be automatically rerendered in the next frame.
Using push is preferrable for dynamic waveform, when not all the samples are known, because it is highly optimized for large scale repaints.

### `waveform.set(data, cb?)`

Set new data for the waveform, discard existing data.

### `waveform.update(options?)`

Update options.

### `waveform.render()`

Force full-cycle rerendering.

### `waveform.draw()`

Single draw pass, useful for cooperation with other components on a single canvas.

## Credits

> [Drawing waveforms](http://www.supermegaultragroovy.com/2009/10/06/drawing-waveforms/) — some insights on the way to draw waveforms.<br/>

## Related

> [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram) — spectrogram painter for any signal.<br/>
> [gl-spectrum](https://github.com/audio-lab/gl-spectrum) — nice-looking signal spectrum visualiser for.<br/>
> [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.<br/>
