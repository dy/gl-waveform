# gl-waveform [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges) [![Build Status](https://img.shields.io/travis/a-vis/gl-waveform.svg)](https://travis-ci.org/a-vis/gl-waveform)

Display time-domain data with WebGL. Provides fair performance / quality among other renderers:

* no performance deterioration (O(n) for updates, O(c) for rendering)
* no memory limitation (O(c * n) for data storage)
* no float32 error introduced by shader

[Demo](https://a-vis.github.io/gl-waveform).

## Usage

Install package as

[![npm i gl-waveform](https://nodei.co/npm/gl-waveform.png?mini=true)](https://npmjs.org/package/gl-waveform/)

Examplary set up is

```js
let Waveform = require('gl-waveform')

// new component instance creates new canvas and puts that to document
let waveform = new Waveform()

// update method sets state of the component: data, color etc.
waveform.update({
	data: [0, .5, 1, .5, 0, -.5, -1, ...],
	color: 'gray',
	range: [0, 44100]
})

// render method draws frame, needs to be called when state is changed
waveform.render()

// push method puts new data to the component instead of rewriting it
waveform.push(newData)
waveform.render()
```

## API

### `waveform = new Waveform(gl|options?)`

Create waveform instance. Argument can specify the way instance is created, can be one of:

* `gl` - existing webgl context
* `regl` - existing [regl](https://ghub.io/regl) instance
* `canvas` - canvas element to initialize waveform on
* `container` - html element to use as a container for new canvas with webgl context
* none - creates new fullscreen canvas and puts into `<body>`
* `options` - an object with properties, see table

Property | Meaning
---|---
`gl`, `regl`, `canvas`, `container` | Same as argument
`pixelRatio` | Device pixel ratio, by default `window.devicePixelRatio`
`viewport` 		| Area within the canvas, an array `[left, top, width, height]` or rectangle `{x, y, width, height}`, see [parse-rect](https://ghub.io/parse-rect).
`invertViewport` | Use webgl viewport direction (bottom → top) instead of normal canvas2d direction (top → bottom). By default - `false`.
`pick` | If picking data is required. By default `true`. Disabling reduces memory usage and increases `push` performance.
`fade` 			| Fade out color based on sdev. That enhances look but reduces shader performance a bit.

### `waveform.update(options)`

Update state of the renderer instance. Possible `options`:

Property | Meaning
---|---
`data`			| Array or typed array with sample data. Usually it contains values from `-1..+1` range, but that can be adjusted via `range` property. An array can be as set of `{x, y}` or `[x, y]` pairs, where skipped values get interpolated eg. `[{x: 10, y: 1}, {x: 20, y: 2}]`.
`range`			| Visible data range, an array with `[start, end]` offsets or a number with samples count of the last added data. Negative numbers use data from the end.
`amplitude` 	| Amplitudes range, number or array `[min, max]`, by default considered `[-1, +1]`.
`color` 		| Trace line color. Can be a color string or an array with float or uint values, eg. `[0,0,1,1]` or `uint8<[100,120,255,255]>`, see [color-normalize](https://ghub.io/color-normalize).
`thickness` 	| Trace line width, number in pixels or a string with units, eg. `3em`.
`pxStep`        | <em>advanced</em> Redefine minimum pixel step. Can enhance zooming precision.

### `waveform.push(data)`

Append new samples to the existing data, instead of rewriting it, same as `waveform.update({push: data})`. This method is optimized for realtime performance, so gl-waveform can be used in audio vis.

### `waveform.render()`

Draw trace frame according to the state.

### `waveform.pick(event|x)`

Get information about samples at `x` coordinate relative to the canvas. Returns an object with `{ values, average, sdev, offset, x, y }` properties.

Property | Meaning
---|---
`average` | Average value for the picking point. The one actually visible on the screen.
`sdev` | Standard deviance for the picking point.
`x`, `y` | Actual coordinates of picking value relative to canvas.
`offset` | An array with `[left, right]` offsets within data.

### `waveform.clear()`

Clear viewport area disposed for the instance.

### `waveform.destroy()`

Dispose waveform instance, data and all assiciated resources.

### Properties

* `waveform.gl` - WebGL context.
* `waveform.canvas` - canvas element.
* `waveform.regl` - regl instance.

<!-- TODO: benchmark -->

<!-- ### See also -->
<!-- * [audio-waveform](https://github.com/a-vis/audio-waveform) − extended waveform renderer for audio. -->

## License

© 2018 Dmitry Yv. MIT License
