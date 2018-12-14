# gl-waveform [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges) [![Build Status](https://img.shields.io/travis/a-vis/gl-waveform.svg)](https://travis-ci.org/a-vis/gl-waveform)

Display time-domain data with WebGL. Provides fair performance / quality among other renderers:

* no performance deterioration - O(n) for update, O(c) for rendering.
* no memory limit - O(c * n).
* no float32 error introduced by shader, at any scale/range/amount of data.
* floating step compensation for non-regular sample sets.
* unique render method of adjustable join-width via sample range sdev.

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

// push method appends new data
waveform.push(newData)
waveform.render()
```

## API

### `waveform = new Waveform(arg|options?)`

`arg` can be:

* `gl` - existing webgl context.
* `regl` - existing [regl](https://ghub.io/regl) instance.
* `canvas` - canvas element to initialize waveform on.
* `container` - html element to use as a container for new canvas with webgl context.
* none - new fullscreen canvas in the `<body>`.

`options` can provide:

Property | Meaning
---|---
`gl`, `regl`, `canvas`, `container` | Same as `arg`.
`pixelRatio` | Device pixel ratio, by default `window.devicePixelRatio`.
`clip` | Viewport area within the canvas, an array `[left, top, width, height]` or rectangle `{x, y, width, height}`, see [parse-rect](https://ghub.io/parse-rect).
`flip` | Use inverted webgl viewport direction (bottom → top) instead of normal canvas2d direction (top → bottom). By default `false`.
`pick` | If picking data is required. By default `true`. Disabling reduces memory usage and increases `push` performance.

### `waveform.update(options)`

Update state of the renderer instance. Possible `options`:

Property | Meaning
---|---
`data`			| Array or typed array with sample values. Usually it contains values from `-1..+1` range, but that can be adjusted via `amplitude` property. An array can be as sequence of `{x, y}` or `[x, y]` pairs, eg. `[{x: 10, y: 1}, {x: 20, y: 2}]` on condition that the x increment is [approximately] constant.
`range`			| Visible data x-range, an array `[start, end]` offsets or a number of the last samples to show. Can also be a 4-value array `[xStart, minAmplitude, xEnd, maxAmplityde]` compatible with other gl-components, in this case `amplitude` property is ignored. Negative x-offsets use data from the end. `null` range displays all available data.
`amplitude` 	| Amplitudes range, number or array `[min, max]`. `null` value uses data min/max.
`color` 		| Trace line color. Can be a color string or an array with float or uint values, eg. `[0,0,1,1]` or `uint8<[100,120,255,255]>`, see [color-normalize](https://ghub.io/color-normalize).
`thickness` 	| Trace line width, number in pixels or a string with units, eg. `3em`.

### `waveform.push(data)`

Append new samples to the existing data, instead of rewriting it, same as `waveform.update({push: data})`. This method is optimized for realtime performance, so gl-waveform can be used in audio vis.

### `waveform.set(data, offset=0)`

Write samples at the specified position, overriding the data at the specified `offset`. By default `offset` corresponds to sample ids, but in case of `{x, y}` data `offset` corresponds to `x` value.

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
