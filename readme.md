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

//update waveform data each 50ms
setTimeout(() => {
	wf.push(newData);
}, 50);
```

<!-- [**`See in action`**](TODO requirebin) -->

## API

### const Waveform = require('gl-waveform')

Get waveform component class. `require('gl-waveform/2d')` for canvas-2d version.

### let waveform = new Waveform(options)

Create waveform instance based off options:

```js
// Container to place waveform element
container: document.body,

// Pre-created webgl context
context: null,

// Audio viewport settings
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

// Fill background into color
background: null,

// Enable alpha to make transparent canvas
alpha: false,

// Draw automatically every frame or only data/options changes
autostart: false,

// Worker mode, a bit heavy for main thread to sample huge waveforms
worker: true,

// Enable panning/zooming by dragging/scrolling
pan: true,
zoom: true
```

### waveform.push(data, cb?)

Append new data to the waveform. Data is whether single sample or array/float array with values from `0..1` range.
The visible waveform will be automatically rerendered in the next frame.
Using push is preferrable for dynamic waveform, when not all the samples are known, because it is highly optimized for large scale repaints.

### waveform.update(options?)

Update options.
It will automatically call render. Do not call this method often, because it recalculates everything possible.

## Credits

> [Drawing waveforms](http://www.supermegaultragroovy.com/2009/10/06/drawing-waveforms/) — some insights on the way to draw waveforms.<br/>

## Related

> [plot-grid](https://github.com/audio-lab/gl-spectrogram) — useful to add time/db info
> [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram) — spectrogram painter for any signal.<br/>
> [gl-spectrum](https://github.com/audio-lab/gl-spectrum) — nice-looking signal spectrum visualiser for.<br/>
> [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.<br/>
> [waveform-data](https://www.npmjs.com/package/waveform-data) — similar waveform drawing component.<br/>
> [waveform-playlist](https://github.com/naomiaro/waveform-playlist) — waveform editor
