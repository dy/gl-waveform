# gl-waveform [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Display time-domain samples with WebGL. The primary goal of the component is highest performance possible.

[![npm i gl-waveform](https://nodei.co/npm/gl-waveform.png?mini=true)](https://npmjs.org/package/gl-waveform/)

```js
let waveform = require('gl-waveform')()

waveform.update({
	data: [0, .5, 1, .5, 0, -.5, -1, ...],
	color: 'gray',
	range: [0, 44100]
})
waveform.render()

waveform.push(newData)
waveform.render()
```

## API

### `let wf = new Waveform(gl|regl|canvas|container|options?)`

Create waveform renderer for the WebGL context `gl`, [`regl`](https://ghub.io/regl), `canvas`/`container` element or based on `options`:

Option | Meaning
---|---
`regl` | Existing `regl` instance. By default new one is created.
`gl`/`context` | Existing WebGL context. By default new one is created.
`canvas` | Existing `canvas` element.
`container` | Existing `container` element. By default new canvas is created within the container.

Call without arguments creates a new fullscreen canvas in `<body>`.

### `wf.update(options)`

Update state of a renderer.

Option | Description
---|---
`data` 		| Position of the text on the screen within the `range`, a couple `[x, y]` or array `[[x ,y], [x, y], ...]` corresponding to text.								|
`color` 		| Text color or array of colors. By default `black`.						|
`thickness` 	| Line width, number in pixels or a string with units.						|
`range` 		| Data area corresponding to position in viewport. Useful for organizing zoom/pan. By default is the same as the viewport `[0, 0, canvas.width, canvas.height]`.																|
`scale`/`translate` | An alternative to `range`.											|
`viewport` 		| Visible area within the canvas, an array `[left, top, width, height]` or rectangle `{x, y, width, height}`, see [parse-rect](https://ghub.io/parse-rect).

### `wf.push(data)`

Append data with new samples, same as `wf.update({push: data})`.

### `wf.render()`

Draw current state.

### `text.destroy()`

Dispose renderer.

### Properties

* `text.gl` - WebGL context.
* `text.canvas` - canvas element.
* `text.regl` - regl instance.

<!-- TODO: benchmark -->


<!-- ### See also -->
<!-- * [audio-waveform](https://github.com/a-vis/audio-waveform) − extended waveform renderer for audio. -->

## License

© 2018 Dmitry Yv. MIT License
