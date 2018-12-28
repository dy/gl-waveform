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
let nidx = require('negative-index')

const MAX_ARGUMENTS = 1024

// FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases

// FIXME: shring 4th NaN channel by putting it to one of fract channels

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

	// pointer to the first/last x values, detected from the first data
	// used for organizing data gaps
	this.lastY
	this.minY = Infinity, this.maxY = -Infinity
	this.total = 0

	// find a good name for runtime draw state
	this.drawOptions = {}

	this.shader = this.createShader(o)

	this.gl = this.shader.gl
	this.regl = this.shader.regl
	this.canvas = this.gl.canvas
	this.blankTexture = this.shader.blankTexture
	this.NaNTexture = this.shader.NaNTexture

	// tick processes accumulated samples to push in the next render frame
	// to avoid overpushing per-single value (also dangerous for wrong step detection or network delays)
	this.pushQueue = []

	// needs flush and recalc
	this.dirty = true

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

			// prepend -1 and -2 ids at the head
			// to over-render for multipass overlay
			x.push(-2, 1, 1, -2, -1, 1)

			for (let i = -1; i < N; i++) {
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
		// frag: glsl('./shader/fill-frag.glsl'),

		uniforms: {
			'samples.id': regl.prop('textureId'),
			'samples.data': regl.prop('samples'),
			'samples.prev': regl.prop('prevSamples'),
			'samples.next': regl.prop('nextSamples'),
			'samples.shape': regl.prop('dataShape'),
			'samples.length': regl.prop('dataLength'),
			'samples.sum': (c, p) => p.samples.sum,
			'samples.sum2': (c, p) => p.samples.sum2,
			'samples.prevSum': (c, p) => p.prevSamples.sum,
			'samples.prevSum2': (c, p) => p.prevSamples.sum2,

			// float32 sample fractions for precision
			'fractions.id': regl.prop('textureId'),
			'fractions.data': regl.prop('fractions'),
			'fractions.prev': regl.prop('prevFractions'),
			'fractions.next': regl.prop('nextFractions'),
			'fractions.shape': regl.prop('dataShape'),
			'fractions.length': regl.prop('dataLength'),
			'fractions.sum': 0,
			'fractions.sum2': 0,
			'fractions.prevSum': 0,
			'fractions.prevSum2': 0,

			passNum: regl.prop('passNum'),
			passId: regl.prop('passId'),
			passOffset: regl.prop('passOffset'),

			// total number of samples
			total: regl.prop('total'),
			range: regl.prop('range'),

			// number of pixels between vertices
			pxStep: regl.prop('pxStep'),
			posShift: regl.prop('posShift'),

			// number of samples between vertices
			sampleStep: regl.prop('sampleStep'),
			translate: regl.prop('translate'),

			// min/max amplitude
			amplitude: regl.prop('amplitude'),

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
			enable: false
		},
		scissor: {
			enable: true,
			box: (c, {clip, viewport}) => clip ? ({x: clip[0], y: clip[1], width: clip[2], height: clip[3]}) : ({x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3]})
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
	blankTexture.sum = 0
	blankTexture.sum2 = 0
	let NaNTexture = regl.texture({
		width: 1,
		height: 1,
		channels: this.textureChannels,
		type: 'float',
		data: new Float32Array([NaN, 0, 0, -1])
	})
	NaNTexture.sum = 0
	NaNTexture.sum2 = 0
	shader = { drawRanges, drawLine, regl, idBuffer, NaNTexture, blankTexture, gl }
	shaderCache.set( gl, shader )
	return shader
}

Object.defineProperties(Waveform.prototype, {
	viewport: {
		get: function () {
			if (!this.dirty) return this.drawOptions.viewport

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
			if (!this.dirty && this.drawOptions) return this.drawOptions.color

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
			if (!this.dirty) return this.drawOptions.amplitude
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
			if (!this.dirty) return this.drawOptions.range
			if (this._range != null) {
				if (typeof this._range === 'number') {
					return [
						nidx(this._range), this.total
					]
				}

				return this._range
			}
			return [0, this.total]
		},
		set: function (range) {
			if (!range) return this._range = null

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
				this._range = range
			}

			this.dirty = true
		}
	}
})

// update visual state
Waveform.prototype.update = function (o) {
	if (!o) return this
	if (o.length != null) o = {data: o}

	this.dirty = true

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
		mode: 'mode',
		shape: 'shape textureShape'
	})

	// forcing rendering mode is mostly used for debugging purposes
	if (o.mode !== undefined) this.mode = o.mode

	if (o.shape !== undefined) {
		if (this.textures.length) throw Error('Cannot set texture shape because textures are initialized already')
		this.textureShape = o.shape
		this.textureLength = this.textureShape[0] * this.textureShape[1]
	}

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

// calculate draw options
Waveform.prototype.calc = function () {
	if (!this.dirty) return this.drawOptions

	this.flush()

	let {total, opacity, amplitude, viewport, range} = this

	let color = this.color
	let thickness = this.thickness

	// calc runtime props
	let span = Math.abs(range[1] - range[0]) || 1

	// init pxStep as max number of stops on the screen to cover the range
	let pxStep = Math.max(
		// width / span = how many pixels per sample to fit the range
		viewport[2] / span,
		// pxStep affects jittering on panning, .5 is good value
		this.pxStep || .5//Math.pow(thickness, .1) * .1
	)

	// init sampleStep as sample interval to fit the data range into viewport
	let sampleStep = pxStep * span / viewport[2]

	// remove float64 residual
	sampleStep = f32.float(sampleStep)

	// snap sample step to 2^n grid: still smooth, but reduces float32 error
	// FIXME: make sampleStep snap step detection based on the span
	// round is better than ceil: ceil generates jittering
	sampleStep = Math.round(sampleStep * 1) / 1

	// recalc pxStep to adjust changed sampleStep, to fit initial the range
	pxStep = viewport[2] * sampleStep / span
	// FIXME: ↑ pxStep is close to 0.5, but can vary here somewhat
	// pxStep = Math.ceil(pxStep * 16) / 16

	let pxPerSample = pxStep / sampleStep

	// translate is calculated so to meet conditions:
	// - sampling always starts at 0 sample of 0 texture
	// - panning never breaks that rule
	// - changing sampling step never breaks that rule
	// - to reduce error for big translate, it is rotated by textureLength
	// - panning is always perceived smooth

	// translate snapped to samplesteps makes sure 0 sample is picked pefrectly
	// let translate =  Math.floor(range[0] / sampleStep) * sampleStep
	// let translate = Math.floor((-range[0] % (this.textureLength * 3)) / sampleStep) * sampleStep
	// if (translate < 0) translate += this.textureLength

	// compensate snapping for low scale levels
	let posShift = 0.
	if (pxPerSample > 1) {
		posShift = (Math.round(range[0]) - range[0]) * pxPerSample;
	}

	let mode = this.mode

	// detect passes number needed to render full waveform
	let passNum = Math.ceil(Math.floor(span * 1000) / 1000 / this.textureLength)
	let passes = Array(passNum)
	let firstTextureId = Math.round(range[0] / this.textureLength)
	let clipWidth = Math.min(this.textureLength / sampleStep * pxStep, viewport[2])

	for (let i = 0; i < passNum; i++) {
		let textureId = firstTextureId + i;

		// ignore negative textures
		if (textureId < -1) continue;
		if (textureId > this.textures.length) continue;

		let clipLeft = Math.round(i * clipWidth)
		let clipRight = Math.round((i + 1) * clipWidth)
		let clip = [
			clipLeft + viewport[0],
			viewport[1],
			// clipWidth here may fluctuate due to rounding
			clipRight - clipLeft,
			viewport[3]
		]
		// offset within the pass
		let passOffset = Math.round(range[0] / this.textureLength) * this.textureLength
		let translate = Math.round(range[0]) - passOffset

		let samplesNumber = Math.min(
			// number of visible points
			Math.ceil(clipWidth / pxStep),

			// max number of samples per pass
			Math.ceil(this.textureLength / sampleStep)
		)

		passes[i] = {
			passId: i,
			textureId: textureId,
			clip: clip,
			passOffset: passOffset,

			// translate depends on pass
			translate: translate,

			// FIXME: reduce 3 to 2 or less
			// number of vertices to fill the clip width, including l/r overlay
			count: Math.min(4 + 4 * samplesNumber * 3 + 4, this.maxSampleCount),

			offset: 0,

			samples: this.textures[textureId] || this.NaNTexture,
			fractions: this.textures2[textureId] || this.blankTexture,
			prevSamples: this.textures[textureId - 1] || this.NaNTexture,
			nextSamples: this.textures[textureId + 1] || this.NaNTexture,
			prevFractions: this.textures2[textureId - 1] || this.blankTexture,
			nextFractions: this.textures2[textureId + 1] || this.blankTexture,

			// position shift to compensate sampleStep snapping
			shift: 0
		}
	}

	// use more complicated range draw only for sample intervals
	// note that rangeDraw gives sdev error for high values dataLength
	this.drawOptions = {
		thickness, color, pxStep, pxPerSample, viewport,
		sampleStep, span, total, opacity, amplitude, range, mode, passes,
		passNum,
		posShift,
		dataShape: this.textureShape,
		dataLength: this.textureLength
	}

	this.dirty = false

	return this.drawOptions
}

// draw frame according to state
Waveform.prototype.render = function () {
	this.flush()

	if (this.total < 2) return this

	let o = this.calc()

	// multipass renders different textures to adjacent clip areas
	o.passes.forEach((pass) => {
		if (!pass) return

		// o ← {count, offset, clip, texture, shift}
		extend(o, pass)

		// range case
		if (o.pxPerSample <= 1. || (o.mode === 'range' && o.mode != 'line')) {
			this.shader.drawRanges.call(this, o)
			console.log('range')
		}

		// line case
		else {
			// this.shader.drawLine.call(this, extend({}, o, {
			// 	color: [255, 0, 0, 255],
			// 	primitive: 'points'
			// }))

			this.shader.drawLine.call(this, o)
			console.log('line')
		}
	})


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

	if (this.dirty && this.dirty.call) this.dirty()
	this.dirty = idle(() => {
		this.flush()
	})

	return this
}

// drain pushQueue
Waveform.prototype.flush = function () {
	// cancel planned callback
	if (this.dirty && this.dirty.call) this.dirty()
	if (this.pushQueue.length) {
		let arr = this.pushQueue
		this.set(arr, this.total)
		this.pushQueue.length = 0
	}
	return this
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

	this.dirty = true

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

	// detect textureShape based on limits
	// in order to reset sum2 more frequently to reduce error
	if (!this.textureShape) {
		this.textureShape = [512, 512]
		this.textureLength = this.textureShape[0] * this.textureShape[1]
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
		let txtData = pool.mallocFloat64(txtLen * ch)

		// fill txt data with NaNs for proper start/end/gap detection
		for (let i = 0; i < txtData.length; i+=ch) {
			txtData[i + 3] = -1
		}

		txt = this.textures[id] = this.regl.texture({
			width: this.textureShape[0],
			height: this.textureShape[1],
			channels: ch,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp'],
			data: f32.float(txtData)
		})
		this.lastY = txt.sum = txt.sum2 = 0

		txtFract = this.textures2[id] = this.regl.texture({
			width: this.textureShape[0],
			height: this.textureShape[1],
			channels: ch,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp']
		})

		txt.data = txtData
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = txt.data.subarray(offset * ch, offset * ch + dataLen * ch) //pool.mallocFloat64(dataLen * ch)
	for (let i = 0, l = dataLen; i < l; i++) {
		// put NaN samples as indicators of blank samples
		if (!isNaN(samples[i])) {
			data[i * ch] = this.lastY = samples[i]
			data[i * ch + 3] = 0
		}
		else {
			data[i * ch] = NaN

			// write NaN values as a definite flag
			data[i * ch + 3] = -1
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
Waveform.prototype.color
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
Waveform.prototype.textureShape
Waveform.prototype.textureLength
Waveform.prototype.textureChannels = 4
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
