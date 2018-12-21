'use strict'

let pick = require('pick-by-alias')
let extend = require('object-assign')
let WeakMap = require('weak-map')
let createRegl = require('regl')
let parseRect = require('parse-rect')
let createGl = require('gl-util/context')
let isObj = require('is-plain-obj')
let pool = require('typedarray-pool')
let glsl = require('glslify')
let rgba = require('color-normalize')
let neg0 = require('negative-zero')
let f32 = require('to-float32')
let parseUnit = require('parse-unit')
let px = require('to-px')
let lerp = require('lerp')
let isBrowser = require('is-browser')
let elOffset = require('offset')
let idle = require('on-idle')

const MAX_ARGUMENTS = 1024

// FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases

let shaderCache = new WeakMap()


function Waveform (o) {
	if (!(this instanceof Waveform)) return new Waveform(o)

	// stack of textures with sample data
	// for a single pass we provide 2 textures, covering the screen
	// every new texture resets accumulated sum/sum2 values
	// textures store [amp, sum, sum2] values
	// textures2 store [ampFract, sumFract, sum2Fract, _] values
	// ampFract has util values: -1 for NaN amplitude
	this.textures = []
	this.textures2 = []
	this.textureLength = this.textureShape[0] * this.textureShape[1]

	// pointer to the first/last x values, detected from the first data
	// used for organizing data gaps
	this.lastY
	this.minY = Infinity, this.maxY = -Infinity
	this.total = 0

	// find a good name for runtime draw state
	this.drawOptions = {}

	// needs recalc
	this.needsFlush = true

	this.shader = this.createShader(o)

	this.gl = this.shader.gl
	this.regl = this.shader.regl
	this.canvas = this.gl.canvas

	// tick processes accumulated samples to push in the next render frame
	// to avoid overpushing per-single value (also dangerous for wrong step detection or network delays)
	this.pushQueue = []

	// FIXME: add beter recognition
	// if (o.pick != null) this.storeData = !!o.pick
	// if (o.fade != null) this.fade = !!o.fade

	if (isObj(o)) this.update(o)
}

// create waveform shader, called once per gl context
Waveform.prototype.createShader = function (o) {
	let regl, gl, shader
	if (!o) o = {}

	// check shader cache
	shader = shaderCache.get(o)
	if (shader) return shader

	if (isRegl(o)) o = {regl: o}


	// we let regl init window/container in default case
	// because it binds resize event to window
	if (isObj(o) && !o.canvas && !o.gl && !o.regl) {
		regl = createRegl({
			extensions: 'oes_texture_float'
		})
		gl = regl._gl

		shader = shaderCache.get(gl)
		if (shader) return shader
	}
	else {
		gl = createGl(o)
		shader = shaderCache.get(gl)
		if (shader) return shader

		regl = createRegl({
			gl, extensions: 'oes_texture_float'
		})
	}

	//    id    0     1
	//   side  ←→    ←→
	//         **    **
	//        /||   /||   ...     ↑
	//    .../ ||  / ||  /       sign
	//         || /  || /         ↓
	//         **    **
	let idBuffer = regl.buffer({
		usage: 'static',
		type: 'int16',
		data: (N => {
			let x = Array()
			for (let i = 0; i < N; i++) {
				// id, sign, side, id, sign, side
				x.push(i, 1, -1, i, -1, -1)
				x.push(i, 1, 1, i, -1, 1)
			}
			return x
		})(this.maxSampleCount)
	})

	let shaderOptions = {
		primitive: (c, p) => p.primitive || 'triangle strip',
		offset: regl.prop('offset'),
		count: regl.prop('count'),

		frag: glsl('./shader/fade-frag.glsl'),

		uniforms: {
			// we provide only 2 textures
			// in order to display texture join smoothly
			// but min zoom level is limited so
			// that only 2 textures can fit the screen
			// zoom levels higher than that give artifacts
			'samples.data[0]': function (c, p) {
				return this.textures[p.currTexture] || this.shader.blankTexture
			},
			'samples.data[1]': function (c, p) {
				return this.textures[p.currTexture + 1] || this.shader.blankTexture
			},
			// data0 texture sums
			'samples.sum': function (c, p) {
				return this.textures[p.currTexture] ? this.textures[p.currTexture].sum : 0
			},
			'samples.sum2': function (c, p) {
				return this.textures[p.currTexture] ? this.textures[p.currTexture].sum2 : 0
			},
			'samples.shape': this.textureShape,
			'samples.length': this.textureLength,

			// samples-compatible struct with fractions
			'fractions.data[0]': function (c, p) {
				return this.textures2[p.currTexture] || this.shader.blankTexture
			},
			'fractions.data[1]': function (c, p) {
				return this.textures2[p.currTexture + 1] || this.shader.blankTexture
			},
			'fractions.sum': 0,
			'fractions.sum2': 0,
			'fractions.shape': this.textureShape,
			'fractions.length': this.textureLength,

			// number of samples per viewport
			span: regl.prop('span'),
			// total number of samples
			total: regl.prop('total'),
			// number of pixels between vertices
			pxStep: regl.prop('pxStep'),
			// number of pixels per sample step
			pxPerSample: regl.prop('pxPerSample'),
			// number of samples between vertices
			sampleStep: regl.prop('sampleStep'),
			translate: regl.prop('translate'),

			// min/max amplitude
			amp: regl.prop('amplitude'),

			viewport: regl.prop('viewport'),
			opacity: regl.prop('opacity'),
			color: regl.prop('color'),
			thickness: regl.prop('thickness')
		},

		attributes: {
			id: {
				buffer: idBuffer,
				stride: 6,
				offset: 0
			},
			sign: {
				buffer: idBuffer,
				stride: 6,
				offset: 2
			},
			side: {
				buffer: idBuffer,
				stride: 6,
				offset: 4
			}
		},
		blend: {
			enable: true,
			color: [0,0,0,0],
			equation: {
				rgb: 'add',
				alpha: 'add'
			},
			func: {
				srcRGB: 'src alpha',
				dstRGB: 'one minus src alpha',
				srcAlpha: 'one minus dst alpha',
				dstAlpha: 'one'
			}
		},
		depth: {
			// FIXME: disable for the case of null folding
			enable: true
		},
		scissor: {
			enable: true,
			box: (c, {viewport}) => ({x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3]})
		},
		viewport: (c, {viewport}) => ({x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3]}),
		stencil: false
	}

	let drawRanges = regl(extend({
		vert: glsl('./shader/range-vert.glsl')
	}, shaderOptions))
	let drawLine = regl(extend({
		vert: glsl('./shader/line-vert.glsl')
	}, shaderOptions))


	// let drawPick = regl(extend({
	// 	frag: glsl('./shader/pick-frag.glsl')
	// }))

	let blankTexture = regl.texture({
		width: 1,
		height: 1,
		channels: this.textureChannels,
		type: 'float'
	})
	shader = { drawRanges, drawLine, regl, idBuffer, blankTexture, gl }
	shaderCache.set( gl, shader )
	return shader
}

Object.defineProperties(Waveform.prototype, {
	viewport: {
		get: function () {
			if (!this.needsFlush) return this.drawOptions.viewport

			var viewport

			if (!this._viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight]
			else viewport = [this._viewport.x, this._viewport.y, this._viewport.width, this._viewport.height]

			// invert viewport if necessary
			if (!this.flip) {
				viewport[1] = this.gl.drawingBufferHeight - viewport[1] - viewport[3]
			}

			return viewport
		},
		set: function (v) {
			this._viewport = v ? parseRect(v) : v
		}
	},

	color: {
		get: function () {
			if (!this.needsFlush) return this.drawOptions.color

			return this._color || [0, 0, 0, 255]
		},
		// flatten colors to a single uint8 array
		set: function (v) {
			if (!v) v = 'transparent'

			// single color
			if (typeof v === 'string') {
				this._color = rgba(v, 'uint8')
			}
			// flat array
			else if (typeof v[0] === 'number') {
				let l = Math.max(v.length, 4)
				if (this._color) pool.freeUint8(this._color)
				this._color = pool.mallocUint8(l)
				let sub = (v.subarray || v.slice).bind(v)
				for (let i = 0; i < l; i += 4) {
					this._color.set(rgba(sub(i, i + 4), 'uint8'), i)
				}
			}
			// nested array
			else {
				let l = v.length
				if (this._color) pool.freeUint8(this._color)
				this._color = pool.mallocUint8(l * 4)
				for (let i = 0; i < l; i++) {
					this._color.set(rgba(v[i], 'uint8'), i * 4)
				}
			}
		}
	},

	amplitude: {
		get: function () {
			if (!this.needsFlush) return this.drawOptions.amplitude
			return this._amplitude || [this.minY, this.maxY]
		},
		set: function (amplitude) {
			if (typeof amplitude === 'number') {
				this._amplitude = [-amplitude, +amplitude]
			}
			else if (amplitude.length) {
				this._amplitude = [amplitude[0], amplitude[1]]
			}
			else {
				this._amplitude = amplitude
			}
		}
	},

	range: {
		get: function () {
			if (!this.needsFlush) return this.drawOptions.range
			return this._range || [0, this.total + this.pushQueue.length - 1]
		},
		set: function (range) {
			if (range.length) {
				// support vintage 4-value range
				if (range.length === 4) {
					this._range = [range[0], range[2]]
					this.amplitude = [range[1], range[3]]
				}
				else {
					this._range = [range[0], range[1]]
				}
			}
			else if (typeof range === 'number') {
				this._range = [-range, -0]
			}
		}
	}
})

// update visual state
Waveform.prototype.update = function (o) {
	if (!o) return this
	if (o.length != null) o = {data: o}

	this.needsFlush = true

	o = pick(o, {
		data: 'data value values sample samples',
		push: 'add append push insert concat',
		range: 'range dataRange dataBox dataBounds dataLimits',
		amplitude: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
		thickness: 'thickness width linewidth lineWidth line-width',
		pxStep: 'step pxStep',
		color: 'color colour colors colours fill fillColor fill-color',
		line: 'line line-style lineStyle linestyle',
		viewport: 'clip vp viewport viewBox viewbox viewPort area',
		opacity: 'opacity alpha transparency visible visibility opaque',
		flip: 'flip iviewport invertViewport inverseViewport',
		mode: 'mode'
	})

	// forcing rendering mode is mostly used for debugging purposes
	if (o.mode !== undefined) this.mode = o.mode

	// parse line style
	if (o.line) {
		if (typeof o.line === 'string') {
			let parts = o.line.split(/\s+/)

			// 12px black
			if (/0-9/.test(parts[0][0])) {
				if (!o.thickness) o.thickness = parts[0]
				if (!o.color && parts[1]) o.color = parts[1]
			}
			// black 12px
			else {
				if (!o.thickness && parts[1]) o.thickness = parts[1]
				if (!o.color) o.color = parts[0]
			}
		}
		else {
			o.color = o.line
		}
	}

	if (o.thickness !== undefined) {
		this.thickness = toPx(o.thickness)
	}

	if (o.pxStep !== undefined) {
		this.pxStep = toPx(o.pxStep)
	}

	if (o.opacity !== undefined) {
		this.opacity = parseFloat(o.opacity)
	}

	if (o.viewport !== undefined) {
		this.viewport = o.viewport
	}

	if (o.flip) {
		this.flip = !!o.flip
	}

	if (o.range !== undefined) {
		this.range = o.range
	}

	if (o.color !== undefined) {
		this.color = o.color
	}

	if (o.amplitude !== undefined) {
		this.amplitude = o.amplitude
	}

	// reset sample textures if new samples data passed
	if (o.data) {
		this.total = 0
		this.lastY = null
		this.minY = Infinity
		this.maxY = -Infinity
		this.push(o.data)
	}

	// call push method
	if (o.push) {
		this.push(o.push)
	}

	return this
}

// append samples, will be put into texture at the next frame or idle
Waveform.prototype.push = function (...samples) {
	if (!samples || !samples.length) return this

	for (let i = 0; i < samples.length; i++) {
		if (samples[i].length) {
			if (samples[i].length > MAX_ARGUMENTS) {
				for (let j = 0; j < samples[i].length; j++) {
					this.pushQueue.push(samples[i][j])
				}
			}
			else this.pushQueue.push(...samples[i])
		}
		else this.pushQueue.push(samples[i])
	}

	if (this.needsFlush && this.needsFlush.call) this.needsFlush()
	this.needsFlush = idle(() => {
		this.flush()
	})

	return this
}

// drain pushQueue
Waveform.prototype.flush = function () {
	// cancel planned callback
	if (this.needsFlush && this.needsFlush.call) this.needsFlush()
	if (this.pushQueue.length) {
		let arr = this.pushQueue
		this.set(arr, this.total)
		this.pushQueue.length = 0
	}
	return this
}

// calculate draw options
Waveform.prototype.calc = function () {
	if (!this.needsFlush) return this.drawOptions

	this.flush()

	let {total, opacity, amplitude, viewport, range} = this

	let color = this.color
	let thickness = this.thickness

	// calc runtime props
	let span = (range[1] - range[0]) || 1

	let dataLength = this.textureLength

	let pxStep = Math.max(
		// width / span makes step correspond to texture samples
		viewport[2] / Math.abs(span),
		// pxStep affects jittering on panning, .5 is good value
		this.pxStep || Math.pow(thickness, .1) * .1
	)
	// pxStep = Math.ceil(pxStep * 16) / 16

	// pxStep = .25
	let sampleStep = pxStep * span / viewport[2]

	// snap sample step to 2^n grid: still smooth, but reduces float32 error
	if (sampleStep) sampleStep = Math.round(sampleStep * 16) / 16

	let pxPerSample = pxStep / sampleStep

	// translate is calculated so to meet conditions:
	// - sampling always starts at 0 sample of 0 texture
	// - panning never breaks that rule
	// - changing sampling step never breaks that rule
	// - to reduce error for big translate, it is rotated by textureLength
	// - panning is always perceived smooth

	// let translates = Math.floor(range[0] / sampleStep)
	let translate =  Math.floor((range[0] % dataLength) / sampleStep) * sampleStep

	// let translatei = translates * sampleStep
	// let translateri = Math.floor(translatei % dataLength)

	// correct translater to always be under translateri
	// for correct posShift in shader
	// if (translater < translateri) translater += dataLength

	// NOTE: this code took ~3 days
	// please beware of circular texture join cases and low scales
	// .1 / sampleStep is error compensation
	// let totals = Math.floor(this.total / sampleStep + .1 / sampleStep)

	let currTexture = Math.floor(range[0] / dataLength)

	if (range[0] < 0) currTexture += 1

	let VERTEX_REPEAT = 2.;

	// limit not existing in texture points
	let offset = 2. * Math.max(-VERTEX_REPEAT * Math.floor(range[0] / sampleStep), 0)

	let count = Math.max(2,
		Math.min(
			// number of visible texture sampling points
			// 2. * Math.floor((dataLength * Math.max(0, (2 + Math.min(currTexture, 0))) - (translate % dataLength)) / sampleStep),

			// number of available data points
			2 * Math.floor(total - Math.max(translate / sampleStep, 0)),

			// number of visible vertices on the screen
			2 * Math.ceil(viewport[2] / pxStep) + 4,

			// number of ids available
			this.maxSampleCount
		) * VERTEX_REPEAT
	)

	let mode = this.mode

	// use more complicated range draw only for sample intervals
	// note that rangeDraw gives sdev error for high values dataLength
	this.drawOptions = {
		offset, count, thickness, color, pxStep, pxPerSample, viewport,
		translate, currTexture, sampleStep, span, total, opacity, amplitude, range, mode
	}

	this.needsFlush = false

	return this.drawOptions
}

// write samples into texture
Waveform.prototype.set = function (samples, at=0) {
	if (!samples || !samples.length) return this

	// draing queue, if possible overlap with total
	if (at + samples.length > this.total + this.pushQueue.length) {
		this.flush()
	}

	// future fill: provide NaN data
	if (at > this.total) {
		this.set(Array(at - this.total), this.total)
	}

	this.needsFlush = true

	// carefully handle array
	if (Array.isArray(samples)) {
		let floatSamples = pool.mallocFloat64(samples.length)

		for (let i = 0; i < samples.length; i++) {
			// put NaN samples as indicators of blank samples
			if (samples[i] == null || isNaN(samples[i])) {
				floatSamples[i] = NaN
			}
			else {
				floatSamples[i] = samples[i]
			}
		}

		samples = floatSamples
	}

	// detect min/maxY
	for (let i = 0; i < samples.length; i++) {
		if (this.minY > samples[i]) this.minY = samples[i]
		if (this.maxY < samples[i]) this.maxY = samples[i]
	}

	let [txtW, txtH] = this.textureShape
	let txtLen = this.textureLength

	let offset = at % txtLen
	let id = Math.floor(at / txtLen)
	let y = Math.floor(offset / txtW)
	let x = offset % txtW
	let tillEndOfTxt = txtLen - offset
	let ch = this.textureChannels

	// get current texture
	let txt = this.textures[id]
	let txtFract = this.textures2[id]

	if (!txt) {
		txt = this.textures[id] = this.regl.texture({
			width: this.textureShape[0],
			height: this.textureShape[1],
			channels: this.textureChannels,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp']
		})
		this.lastY = txt.sum = txt.sum2 = 0

		txtFract = this.textures2[id] = this.regl.texture({
			width: this.textureShape[0],
			height: this.textureShape[1],
			channels: this.textureChannels,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp']
		})

		txt.data = pool.mallocFloat64(txtLen * ch)
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = txt.data.subarray(offset * ch, offset * ch + dataLen * ch) //pool.mallocFloat64(dataLen * ch)
	for (let i = 0, l = dataLen; i < l; i++) {
		// put NaN samples as indicators of blank samples
		if (!isNaN(samples[i])) {
			data[i * ch] = this.lastY = samples[i]
		}
		else {
			data[i * ch] = NaN
		}

		txt.sum += this.lastY
		txt.sum2 += this.lastY * this.lastY

		// we cannot rotate sums here because there can be any number of rotations between two edge samples
		// also that is hard to guess correct rotation limit, that can change at any new data
		// so we just keep precise secondary texture and hope the sum is not huge enough to reset at the next texture
		data[i * ch + 1] = txt.sum
		data[i * ch + 2] = txt.sum2
	}
	// increase total by the number of new samples
	if (this.total - at < dataLen) this.total += dataLen - (this.total - at)

	// fullfill last unfinished row
	let firstRowWidth = 0
	if (x) {
		firstRowWidth = Math.min(txtW - x, dataLen)

		writeTexture(x, y, firstRowWidth, 1, data.subarray(0, firstRowWidth * ch))

		// if data is shorter than the texture row - skip the rest
		if (x + samples.length <= txtW) {
			pool.freeFloat64(samples)
			pool.freeFloat64(data)
			return this
		}

		y++

		// shortcut next texture block
		if (y === txtH) {
			pool.freeFloat64(data)
			this.push(samples.subarray(firstRowWidth))
			pool.freeFloat64(samples)
			return this
		}

		offset += firstRowWidth
	}

	// put rect with data
	let h = Math.floor((dataLen - firstRowWidth) / txtW)
	let blockLen = 0
	if (h) {
		blockLen = h * txtW

		writeTexture(0, y, txtW, h, data.subarray(firstRowWidth * ch, (firstRowWidth + blockLen) * ch))
		y += h
	}

	// put last row
	let lastRowWidth = dataLen - firstRowWidth - blockLen
	if (lastRowWidth) {
		writeTexture(0, y, lastRowWidth, 1, data.subarray(-lastRowWidth * ch))
	}

	// shorten block till the end of texture
	if (tillEndOfTxt < samples.length) {
		this.set(samples.subarray(tillEndOfTxt), this.total)

		pool.freeFloat64(samples)
		pool.freeFloat64(data)

		return this
	}

	// put data to texture, provide NaN transport & performant fractions calc
	function writeTexture (x, y, w, h, data) {
		let f32data = pool.mallocFloat32(data.length)
		let f32fract = pool.mallocFloat32(data.length)
		for (let i = 0; i < data.length; i++) {
			f32data[i] = data[i]
			f32fract[i] = data[i] - f32data[i]
		}
		// for (let i = 0; i < data.length; i+=4) {
		// 	if (isNaN(data[i])) f32fract[i] = -1
		// }

		txt.subimage({
			width: w,
			height: h,
			data: f32data
		}, x, y)
		txtFract.subimage({
			width: w,
			height: h,
			data: f32fract
		}, x, y)

		pool.freeFloat32(f32data)
		pool.freeFloat32(f32fract)
	}

	return this
}

// draw frame according to state
Waveform.prototype.render = function () {
	this.flush()

	if (this.total < 2) return this

	let o = this.calc()

	// range case
	if (o.pxPerSample <= 1. || (o.mode === 'range' && o.mode != 'line')) {
		this.shader.drawRanges.call(this, o)
	}

	// line case
	else {
		this.shader.drawLine.call(this, o)
		// this.shader.drawLine.call(this, extend(o, {
		// 	primitive: 'line strip',
		// 	color: [0,0,255,255]
		// }))
		// this.shader.drawLine.call(this, extend(o, {
		// 	primitive: 'points',
		// 	color: [0,0,0,255]
		// }))
	}

	return this
}

// get data at a point
Waveform.prototype.pick = function (x) {
	if (!this.storeData) throw Error('Picking is disabled. Enable it via constructor options.')

	if (typeof x !== 'number') {
		x = Math.max(x.clientX - elOffset(this.canvas).left, 0)
	}

	let {span, translater, translateri, viewport, currTexture, sampleStep, pxPerSample, pxStep, amplitude} = this.calc()

	let txt = this.textures[currTexture]

	if (!txt) return null

	let xOffset = Math.floor(span * x / viewport[2])
	let offset = Math.floor(translater + xOffset)
	let xShift = translater - translateri

	if (offset < 0 || offset > this.total) return null

	let ch = this.textureChannels
	// FIXME: use samples array
	let data = txt.data

	let samples = data.subarray(offset * ch, offset * ch + ch)

	// single-value pick
	// if (pxPerSample >= 1) {
		let avg = samples[0]
		return {
			average: avg,
			sdev: 0,
			offset: [offset, offset],
			x: viewport[2] * (xOffset - xShift) / span + this.viewport.x,
			y: ((-avg - amplitude[0]) / (amplitude[1] - amplitude[0])) * this.viewport.height + this.viewport.y
		}
	// }

	// FIXME: multi-value pick
}

// clear viewport area occupied by the renderer
Waveform.prototype.clear = function () {
	if (!this.drawOptions) return this

	let {gl, regl} = this
	let {x, y, width, height} = this.viewport
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(x, y, width, height)

	// FIXME: avoid depth here
    regl.clear({color: [0, 0, 0, 0], depth: 1})
    gl.clear(gl.COLOR_BUFFRE_BIT | gl.DEPTH_BUFFER_BIT)

    gl.disable(gl.SCISSOR_TEST)

    return this
}

// dispose all resources
Waveform.prototype.destroy = function () {
	this.textures.forEach(txt => {
		txt.destroy()
	})
	this.textures2.forEach(txt => {
		txt.destroy()
	})
}


// style
Waveform.prototype.color = new Uint8Array([0,0,0,255])
Waveform.prototype.opacity = 1
Waveform.prototype.thickness = 1
Waveform.prototype.mode = null
// Waveform.prototype.fade = true

Waveform.prototype.flip = false

// Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures
Waveform.prototype.textureShape = [512, 512]

Waveform.prototype.textureChannels = 3
Waveform.prototype.maxSampleCount = 8192 * 2

Waveform.prototype.storeData = true

function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}

function isNeg(v) {
	return v < 0 || neg0(v)
}

function toPx(str) {
	if (typeof str === 'number') return str
	if (!isBrowser) return parseFloat(str)
	let unit = parseUnit(str)
	return unit[0] * px(unit[1])
}


module.exports = Waveform
