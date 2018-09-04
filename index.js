'use strict'


import pick from 'pick-by-alias'
import extend from 'object-assign'
import nidx from 'negative-index'
import WeakMap from 'es6-weak-map'
import createRegl from 'regl'
import parseRect from 'parse-rect'
import createGl from 'gl-util/context'
import isObj from 'is-plain-obj'
import pool from 'typedarray-pool'
import glsl from 'glslify'
import rgba from 'color-normalize'
import nz from 'is-negative-zero'
import f32 from 'to-float32'
import parseUnit from 'parse-unit'
import px from 'to-px'


// FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases

let shaderCache = new WeakMap()


function Waveform (o) {
	if (!(this instanceof Waveform)) return new Waveform(o)

	if (isRegl(o)) {
		o = {regl: o}
		this.gl = o.regl._gl
	}
	else {
		this.gl = createGl(o)
	}
	if (!o) o = {}
	else if (o) {
		if (o.pick != null) this.storeData = !!o.pick
		if (o.fade != null) this.fade = !!o.fade
	}
	// stack of textures with sample data
	this.textures = []
	this.textureLength = this.textureSize[0] * this.textureSize[1]
	// total number of samples
	this.total = 0

	this.shader = shaderCache.get(this.gl)
	if (!this.shader) {
		this.shader = this.createShader(o)
		shaderCache.set(this.gl, this.shader)
	}

	this.regl = this.shader.regl
	this.canvas = this.gl.canvas


	this.update(o)
}

// create waveform shader, called once per gl context
Waveform.prototype.createShader = function (o) {
	let regl = o.regl || createRegl({
		gl: this.gl,
		extensions: ['oes_texture_float', 'oes_texture_float_linear']
	})

	let idBuffer = regl.buffer({
		usage: 'static',
		type: 'int16',
		data: (N => {
			let x = Array(N * 4)
			for (let i = 0; i < N; i++) {
				x[i * 4] = i
				x[i * 4 + 1] = 1
				x[i * 4 + 2] = i
				x[i * 4 + 3] = -1
			}
			return x
		})(this.maxSampleCount)
	})

	let shaderOptions = {
		primitive: (c, p) => p.primitive || 'triangle strip',
		offset: regl.prop('offset'),
		count: regl.prop('count'),

		frag: this.fade ? glsl('./shader/fade.glsl') : `
		precision highp float;
		varying vec4 fragColor;
		void main() {
			gl_FragColor = fragColor;
		}
		`,

		uniforms: {
			// we provide only 2 textures
			// in order to display texture join smoothly
			// but min zoom level is limited so
			// that only 2 textures can fit the screen
			// zoom levels higher than that give artifacts
			data0: function (c, p) {
				return this.textures[p.currTexture] || this.shader.blankTexture
			},
			data1: function (c, p) {
				return this.textures[p.currTexture + 1] || this.shader.blankTexture
			},
			// data0 texture sums
			sum: function (c, p) {
				return this.textures[p.currTexture] ? this.textures[p.currTexture].sum : 0
			},
			sum2: function (c, p) {
				return this.textures[p.currTexture] ? this.textures[p.currTexture].sum2 : 0
			},
			dataShape: this.textureSize,
			dataLength: this.textureLength,

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
			amp: regl.prop('amp'),

			viewport: regl.prop('viewport'),
			opacity: regl.prop('opacity'),
			color: regl.prop('color'),
			thickness: regl.prop('thickness')
		},

		attributes: {
			id: {
				buffer: idBuffer,
				stride: 4,
				offset: 0
			},
			sign: {
				buffer: idBuffer,
				stride: 4,
				offset: 2
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
		vert: glsl('./shader/range.glsl')
	}, shaderOptions))

	let drawLine = regl(extend({
		vert: glsl('./shader/line.glsl')
	}, shaderOptions))

	let blankTexture = regl.texture({
		width: 1,
		height: 1,
		channels: this.textureChannels,
		type: 'float'
	})

	return { drawRanges, drawLine, regl, idBuffer, blankTexture }
}

// calculate draw options
Waveform.prototype.calc = function () {
	let r = this.range
	let {total, opacity, amp} = this

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
	if (!this.iviewport) {
		viewport[1] = this.canvas.height - viewport[1] - viewport[3]
	}

	let span
	if (!r) span = viewport[2]
	else span = r[1] - r[0]

	let dataLength = this.textureLength

	let pxStep = this.pxStep || (Math.pow(thickness, .25) * .25)
	let minStep = viewport[2] / Math.abs(span)
	// min 1. pxStep reduces jittering on panning
	pxStep = Math.max(pxStep, minStep, 1.)

	let sampleStep = pxStep * span / viewport[2]
	let pxPerSample = pxStep / sampleStep

	// translate is calculated so to meet conditions:
	// - sampling always starts at 0 sample of 0 texture
	// - panning never breaks that rule
	// - changing sampling step never breaks that rule
	// - to reduce error for big translate, it is rotated by textureLength
	// - panning is always perceived smooth

	let translate = r[0]
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

	// limit not existing in texture points
	let offset = 2 * Math.max(-translates, 0)

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
		)
	)

	// use more complicated range draw only for sample intervals
	// note that rangeDraw gives sdev error for high values dataLength
	let drawOptions = {
		offset, count, thickness, color, pxStep, pxPerSample, viewport, translate, translater, totals, translatei, translateri, translateriFract, translates, currTexture, sampleStep, span, total, opacity, amp
	}

	return drawOptions
}

// draw frame according to state
Waveform.prototype.render = function () {
	let o = this.calc()

	// range case
	if (o.pxPerSample <= 1) {
		this.shader.drawRanges.call(this, o)
		// this.shader.drawRanges.call(this, extend(drawOptions, {
		// 	primitive: 'points',
		// 	color: [0,0,0,255]
		// }))
		// this.shader.drawRanges.call(this, extend(drawOptions, {
		// 	primitive: 'points',
		// 	thickness: 0,
		// 	color: [0,0,0,255]
		// }))
	}

	// line case
	else {
		this.shader.drawLine.call(this, o)
		// this.shader.drawLine.call(this, extend(drawOptions, {
		// 	primitive: 'points',
		// 	color: [0,0,0,255]
		// }))
		// this.shader.drawLine.call(this, extend(drawOptions, {
		// 	primitive: 'points',
		// 	thickness: 0,
		// 	color: [0,0,0,255]
		// }))
	}

	return this
}

// get data at a point
Waveform.prototype.pick = function (x) {
	if (!this.storeData) throw Error('Picking is disabled. Enable it via constructor options.')

	if (typeof x !== 'number') x = x.x

	let {span, translater, translateri, viewport, currTexture, sampleStep, pxPerSample, pxStep, amp} = this.calc()

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
			y: ((-avg - amp[0]) / (amp[1] - amp[0])) * this.viewport.height + this.viewport[1]
		}
	// }

	// FIXME: multi-value pick

	console.log(2)
}

// update visual state
Waveform.prototype.update = function (o) {
	if (!o) return this
	o = pick(o, {
		data: 'data value values sample samples',
		push: 'add append push insert concat',
		range: 'range dataRange dataBox dataBounds dataLimits',
		amp: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
		thickness: 'thickness width linewidth lineWidth line-width',
		pxStep: 'step pxStep',
		color: 'color colour colors colours fill fillColor fill-color',
		line: 'line line-style lineStyle linestyle',
		viewport: 'vp viewport viewBox viewbox viewPort',
		opacity: 'opacity alpha transparency visible visibility opaque',
		iviewport: 'iviewport invertViewport inverseViewport'
	})

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

	if (o.thickness != null) {
		this.thickness = toPx(o.thickness)
	}

	if (o.pxStep != null) {
		this.thickness = toPx(o.pxStep)
	}

	if (o.opacity != null) {
		this.opacity = parseFloat(o.opacity)
	}

	if (o.viewport != null) {
		this.viewport = parseRect(o.viewport)
	}
	if (this.viewport == null) {
		this.viewport = {
			x: 0, y: 0,
			width: this.gl.drawingBufferWidth,
			height: this.gl.drawingBufferHeight
		}
	}

	if (o.iviewport) {
		this.iviewport = !!o.viewport
	}

	// custom/default visible data window
	if (o.range != null) {
		if (o.range.length) {
			this.range = [o.range[0], o.range[1]]
		}
		else if (typeof o.range === 'number') {
			this.range = [-o.range, -0]
		}
	}

	if (!this.range && !o.range) {
		this.range = [0, Math.min(this.viewport.width, this.textureLength)]
	}

	if (o.amp) {
		if (typeof o.amp === 'number') {
			this.amp = [-o.amp, +o.amp]
		}
		else if (o.amp.length) {
			this.amp = [o.amp[0], o.amp[1]]
		}
	}


	// flatten colors to a single uint8 array
	if (o.color != null) {
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
		this.textures.forEach(txt => txt.destroy())
		this.total = 0
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

	if (Array.isArray(samples)) {
		let floatSamples = pool.mallocFloat64(samples.length)
		floatSamples.set(samples)
		samples = floatSamples
	}

	let [txtW, txtH] = this.textureSize
	let txtLen = this.textureLength

	let offset = this.total % txtLen
	let id = Math.floor(this.total / txtLen)
	let y = Math.floor(offset / txtW)
	let x = offset % txtW
	let tillEndOfTxt = txtLen - offset
	let ch = this.textureChannels

	// get current texture
	let txt = this.textures[id], prevTxt = this.textures[id - 1]
	if (!txt) {
		txt = this.textures[id] = this.regl.texture({
			width: this.textureSize[0],
			height: this.textureSize[1],
			channels: this.textureChannels,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp']
		})
		txt.sum = txt.sum2 = 0

		if (this.storeData) txt.data = pool.mallocFloat(txtLen * ch)
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = this.storeData ? txt.data.subarray(offset * ch, offset * ch + dataLen * ch) : pool.mallocFloat(dataLen * ch)
	for (let i = 0, l = dataLen; i < l; i++) {
		data[i * ch] = samples[i]
		txt.sum += samples[i]
		txt.sum2 += samples[i] * samples[i]
		data[i * ch + 1] = txt.sum
		data[i * ch + 2] = txt.sum2
		data[i * ch + 3] = f32.fract(txt.sum2)
	}
	this.total += dataLen

	// fullfill last unfinished row
	let firstRowWidth = 0
	if (x) {
		firstRowWidth = Math.min(txtW - x, dataLen)
		txt.subimage({
			width: firstRowWidth,
			height: 1,
			data: data.subarray(0, firstRowWidth * ch)
		}, x, y)

		// if data is shorter than the texture row - skip the rest
		if (x + samples.length <= txtW) {
			pool.freeFloat64(samples)
			if (!this.storeData) pool.freeFloat(data)
			return
		}

		y++

		// shortcut next texture block
		if (y === txtH) {
			if (!this.storeData) pool.freeFloat(data)
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
		txt.subimage({
			width: txtW,
			height: h,
			data: data.subarray(firstRowWidth * ch, (firstRowWidth + blockLen) * ch)
		}, 0, y)
		y += h
	}

	// put last row
	let lastRowWidth = dataLen - firstRowWidth - blockLen
	if (lastRowWidth) {
		txt.subimage({
			width: lastRowWidth,
			height: 1,
			data: data.subarray(-lastRowWidth * ch)
		}, 0, y)
	}

	// shorten block till the end of texture
	if (tillEndOfTxt < samples.length) {
		this.push(samples.subarray(tillEndOfTxt))

		pool.freeFloat64(samples)
		if (!this.storeData) pool.freeFloat(data)

		return
	}
}

Waveform.prototype.destroy = function () {
	this.textures.forEach(txt => {
		if (this.storeData) pool.freeFloat(txt.data)
		txt.destroy()
	})
}

// Default instance values
Waveform.prototype.color = new Uint8Array([0,0,0,255])
Waveform.prototype.opacity = 1
Waveform.prototype.thickness = 1
Waveform.prototype.viewport = null
Waveform.prototype.iviewport = false
Waveform.prototype.range = null
Waveform.prototype.fade = false
Waveform.prototype.amp = [-1, 1]
Waveform.prototype.storeData = true

// Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures
Waveform.prototype.textureSize = [512, 512]
Waveform.prototype.textureChannels = 4
Waveform.prototype.maxSampleCount = 8192


function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}

function isNeg(v) {
	return v < 0 || nz(v)
}

function toPx(str) {
	let unit = parseUnit(str)
	return unit[0] * px(unit[1])
}

module.exports = Waveform
