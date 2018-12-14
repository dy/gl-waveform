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
let flatten = require('flatten-vertex-data')
let lerp = require('lerp')
let isBrowser = require('is-browser')
let elOffset = require('offset')

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

	// total number of samples
	this.total = 0

	// pointer to the first/last x values, detected from the first data
	// used for organizing data gaps
	this.firstX, this.lastY, this.lastX,
	this.minY = Infinity, this.maxY = -Infinity
	this.stepSum = 0

	this.shader = this.createShader(o)

	this.gl = this.shader.gl
	this.regl = this.shader.regl
	this.canvas = this.gl.canvas

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
			// x value change
			stepX: regl.prop('stepX'),
			// number of pixels per sample step
			pxPerSample: regl.prop('pxPerSample'),
			// number of samples between vertices
			sampleStep: regl.prop('sampleStep'),
			translate: regl.prop('translate'),
			// circular translate by textureData
			translater: regl.prop('translater'),
			// translate rounded to sampleSteps
			translatei: regl.prop('translatei'),
			// rotated translatei
			translateri: regl.prop('translateri'),
			translateriFract: regl.prop('translateriFract'),
			// translate in terms of sample steps
			translates: regl.prop('translates'),
			// number of sample steps
			totals: regl.prop('totals'),

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

// calculate draw options
Waveform.prototype.calc = function () {
	let {total, opacity, amplitude, stepX} = this
	let range

	// null stepX averages interval between samples
	if (stepX == null) {
		stepX = this.stepSum / (this.total - 1) || 0
	}

	// null-range spans the whole data range
	if (!this.range) {
		range = [0, (this.lastX - this.firstX) / stepX]
	} else {
		range = [(this.range[0] - this.firstX) / stepX, (this.range[1] - this.firstX) / stepX]
	}

	if (!amplitude) amplitude = [this.minY, this.maxY]

	// FIXME: remove
	// r[0] = -4
	// r[1] = 40

	let color = this.color
	let thickness = this.thickness

	// calc runtime props
	let viewport
	if (!this.viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight]
	else viewport = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]

	// invert viewport if necessary
	if (!this.flip) {
		viewport[1] = this.gl.drawingBufferHeight - viewport[1] - viewport[3]
	}

	let span = (range[1] - range[0])

	let dataLength = this.textureLength

	let pxStep = Math.max(
		// width / span makes step correspond to texture samples
		viewport[2] / Math.abs(span),
		// pxStep affects jittering on panning, .5 is good value
		this.pxStep || Math.pow(thickness, .1) * .1
	)

	let sampleStep = pxStep * span / viewport[2]
	let pxPerSample = pxStep / sampleStep

	// translate is calculated so to meet conditions:
	// - sampling always starts at 0 sample of 0 texture
	// - panning never breaks that rule
	// - changing sampling step never breaks that rule
	// - to reduce error for big translate, it is rotated by textureLength
	// - panning is always perceived smooth

	let translate = range[0]
	let translater = translate % dataLength
	let translates = Math.floor(translate / sampleStep)
	let translatei = translates * sampleStep
	let translateri = Math.floor(translatei % dataLength)
	let translateriFract = (translatei % dataLength) - translateri

	// correct translater to always be under translateri
	// for correct posShift in shader
	if (translater < translateri) translater += dataLength

	// NOTE: this code took ~3 days
	// please beware of circular texture join cases and low scales
	// .1 / sampleStep is error compensation
	let totals = Math.floor(this.total / sampleStep + .1 / sampleStep)

	let currTexture = Math.floor(translatei / dataLength)
	if (translateri < 0) currTexture += 1

	let VERTEX_REPEAT = 2.;

	// limit not existing in texture points
	let offset = 2. * Math.max(-translates * VERTEX_REPEAT, 0)

	let count = Math.max(2,
		Math.min(
			// number of visible texture sampling points
			// 2. * Math.floor((dataLength * Math.max(0, (2 + Math.min(currTexture, 0))) - (translate % dataLength)) / sampleStep),

			// number of available data points
			2 * Math.floor(totals - Math.max(translates, 0)),

			// number of visible vertices on the screen
			2 * Math.ceil(viewport[2] / pxStep) + 4,

			// number of ids available
			this.maxSampleCount
		) * VERTEX_REPEAT
	)

	let mode = this.mode

	// use more complicated range draw only for sample intervals
	// note that rangeDraw gives sdev error for high values dataLength
	let drawOptions = {
		offset, count, thickness, color, pxStep, pxPerSample, viewport, translate, translater, totals, translatei, translateri, translateriFract, translates, currTexture, sampleStep, span, total, opacity, amplitude, stepX, range, mode
	}

	return drawOptions
}

// draw frame according to state
Waveform.prototype.render = function () {
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

// update visual state
Waveform.prototype.update = function (o) {
	if (!o) return this
	if (o.length != null) o = {data: o}

	o = pick(o, {
		data: 'data value values sample samples',
		push: 'add append push insert concat',
		range: 'range dataRange dataBox dataBounds dataLimits',
		amplitude: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
		thickness: 'thickness width linewidth lineWidth line-width',
		pxStep: 'step pxStep',
		stepX: 'xStep xstep interval stepX stepx',
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

	if (o.stepX && this.stepX !== undefined) this.stepX = o.stepX

	if (o.opacity !== undefined) {
		this.opacity = parseFloat(o.opacity)
	}

	if (o.viewport !== undefined) {
		this.viewport = parseRect(o.viewport)
	}
	if (this.viewport == null) {
		this.viewport = {
			x: 0, y: 0,
			width: this.gl.drawingBufferWidth,
			height: this.gl.drawingBufferHeight
		}
	}

	if (o.flip) {
		this.flip = !!o.viewport
	}

	// custom/default visible data window
	if (o.range !== undefined) {
		if (o.range.length) {
			// support vintage 4-value range
			if (o.range.length === 4) {
				this.range = [o.range[0], o.range[2]]
				o.amplitude = [o.range[1], o.range[3]]
			}
			else {
				this.range = [o.range[0], o.range[1]]
			}
		}
		else if (typeof o.range === 'number') {
			this.range = [-o.range, -0]
		}
	}


	if (o.amplitude !== undefined) {
		if (typeof o.amplitude === 'number') {
			this.amplitude = [-o.amplitude, +o.amplitude]
		}
		else if (o.amplitude.length) {
			this.amplitude = [o.amplitude[0], o.amplitude[1]]
		}
		else {
			this.amplitude = o.amplitude
		}
	}


	// flatten colors to a single uint8 array
	if (o.color !== undefined) {
		if (!o.color) o.color = 'transparent'

		// single color
		if (typeof o.color === 'string') {
			this.color = rgba(o.color, 'uint8')
		}
		// flat array
		else if (typeof o.color[0] === 'number') {
			let l = Math.max(o.color.length, 4)
			pool.freeUint8(this.color)
			this.color = pool.mallocUint8(l)
			let sub = (o.color.subarray || o.color.slice).bind(o.color)
			for (let i = 0; i < l; i += 4) {
				this.color.set(rgba(sub(i, i + 4), 'uint8'), i)
			}
		}
		// nested array
		else {
			let l = o.color.length
			pool.freeUint8(this.color)
			this.color = pool.mallocUint8(l * 4)
			for (let i = 0; i < l; i++) {
				this.color.set(rgba(o.color[i], 'uint8'), i * 4)
			}
		}
	}

	// reset sample textures if new samples data passed
	if (o.data) {
		this.total = 0
		this.firstX = null
		this.lastX = null
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

// put new samples into texture
Waveform.prototype.push = function (samples) {
	if (!samples || !samples.length) return

	// [{x, y}, {x, y}, ...]
	// [[x, y], [x, y], ...]
	if (samples[0] && typeof samples[0] !== 'number') {
		let data = pool.mallocFloat64(samples.length)

		// normalize {x, y} objects to flat array
		for (let i = 0; i < samples.length; i++) {
			let coord = samples[i], x, y

			// [x, y]
			if (coord.length) {
				[x, y] = coord
			}
			// {x, y}
			else if (coord.x != null) {
				x = coord.x
				y = coord.y
			}

			if (this.firstX == null) {
				this.firstX = x
			}

			// FIXME: update past values here (stream-forward?)
			if (x <= this.lastX) throw Error(`Passed x value ${x} is <= the last x value ${this.lastX}.`)

			// FIXME: check if new value increases not twice more than the average step - probably missing values. Or should we reflect that in texture.

			// refine xStep
			if (!this.stepX && this.lastX != null) {
				this.stepSum += x - this.lastX
			}

			data[i] = y

			this.lastX = x
			this.lastY = y
		}
		samples = data

	}
	else {
		if (this.firstX == null) this.firstX = 0

		// stepX does not play any role for regular sequence of samples
		if (!this.stepX) this.stepX = 1

		this.lastX = this.total + samples.length - 1
		this.lastY = samples[samples.length - 1]
	}

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

	let offset = this.total % txtLen
	let id = Math.floor(this.total / txtLen)
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

		if (this.storeData) {
			txt.data = pool.mallocFloat64(txtLen * ch)
		}
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = this.storeData ? txt.data.subarray(offset * ch, offset * ch + dataLen * ch) : pool.mallocFloat64(dataLen * ch)
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
	this.total += dataLen

	// fullfill last unfinished row
	let firstRowWidth = 0
	if (x) {
		firstRowWidth = Math.min(txtW - x, dataLen)

		writeTexture(x, y, firstRowWidth, 1, data.subarray(0, firstRowWidth * ch))

		// if data is shorter than the texture row - skip the rest
		if (x + samples.length <= txtW) {
			pool.freeFloat64(samples)
			if (!this.storeData) pool.freeFloat64(data)
			return
		}

		y++

		// shortcut next texture block
		if (y === txtH) {
			if (!this.storeData) pool.freeFloat64(data)
			this.push(samples.subarray(firstRowWidth))
			pool.freeFloat(samples)
			return
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
		this.push(samples.subarray(tillEndOfTxt))

		pool.freeFloat64(samples)
		if (!this.storeData) pool.freeFloat64(data)

		return
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
}

// clear viewport area occupied by the renderer
Waveform.prototype.clear = function () {
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
		if (this.storeData) pool.freeFloat64(txt.data)
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

// clip area
Waveform.prototype.viewport = null
Waveform.prototype.flip = false

// data range
Waveform.prototype.range = null
Waveform.prototype.amplitude = null

// Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures
Waveform.prototype.textureShape = [512, 512]

Waveform.prototype.textureChannels = 3
Waveform.prototype.maxSampleCount = 8192 * 2

// interval between adjacent x values
// we guess input data is homogenous and doesn't suddenly change direction
// sometimes step can vary a bit, ~3% of average, like measured time
// so we detect the step from the first chunk of data
Waveform.prototype.stepX = null

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
