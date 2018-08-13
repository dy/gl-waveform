# gl-waveform [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Display time-domain data with WebGL. Provides fair performance / quality among other renderers.

[Demonstration](https://a-vis.github.io/gl-waveform).

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

### `waveform = new Waveform(gl|regl|canvas|container|options?)`

Create waveform instance. Argument can specify the way instance is created, can be one of:

* `gl` - existing webgl context
* `regl` - existing [regl](https://ghub.io/regl) instance
* `canvas` - canvas element to initialize waveform on
* `container` - html element to use as a container for new canvas with webgl context
* `options` - an object with `regl`, `gl`, `canvas` or `container` properties
* none - creates new fullscreen canvas and puts into `<body>`

### `waveform.update(options)`

Update state of the renderer instance. Possible `options`:

Property | Meaning
---|---
`data`			| Array or typed array with sample data. Usually it contains values from `-1..+1` range, but that can be adjusted via `range` property.						|
`range`			| Visible data range, an array with `[start, end]` offsets or a number with samples count of the last added data. Negative numbers use data from the end.
`amplitude` 	| Amplitudes range, number or array `[min, max]`, by default considered `[-1, +1]`.
`color` 		| Trace line color. Can be a color string or an array with float or uint values, eg. `[0,0,1,1]` or `uint8<[100,120,255,255]>`, see [color-normalize](https://ghub.io/color-normalize).							|
`thickness` 	| Trace line width, number in pixels or a string with units, eg. `3em`.		|
`viewport` 		| Area within the canvas, an array `[left, top, width, height]` or rectangle `{x, y, width, height}`, see [parse-rect](https://ghub.io/parse-rect).

### `waveform.push(data)`

Put new data with new samples, same as `waveform.update({push: data})`.

### `waveform.render()`

Draw trace withing the viewport.

### `waveform.pick(x)`

Get information about samples at defined x coordinate relative to . Returns an object with `{ data, mean, sdev }` properties.

### `waveform.destroy()`

Dispose waveform instance.

### Properties

* `waveform.gl` - WebGL context.
* `waveform.canvas` - canvas element.
* `waveform.regl` - regl instance.

<!-- TODO: benchmark -->

<!-- ### See also -->
<!-- * [audio-waveform](https://github.com/a-vis/audio-waveform) − extended waveform renderer for audio. -->

## License

© 2018 Dmitry Yv. MIT License
