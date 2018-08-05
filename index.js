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

	this.shader = shaderCache.get(this.gl)
	if (!this.shader) {
		this.shader = this.createShader(o)
		shaderCache.set(this.gl, this.shader)
	}

	// total number of samples
	this.total = 0

	this.render = function () {
		let r = this.range

		// FIXME: remove
		// r[0] = -4
		// r[2] = 40

		// calc runtime props
		let viewport
		if (!this.viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight]
		else viewport = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]

		let span
		if (!r) span = [viewport.width, viewport.height]
		else span = [
			(r[2] - r[0]),
			(r[3] - r[1])
		]

		let pxStep = this.pxStep || Math.sqrt(this.thickness) * .5
		let minStep = .5 * viewport[2] / Math.abs(span[0])
		pxStep = Math.max(pxStep, minStep)

		// update current texture
		let currTexture = Math.floor(r[0] / Waveform.textureLength)

		let sampleStep = pxStep * span[0] / viewport[2]

		let color = this.color
		let thickness = this.thickness

		let translate = r[0]
		let dataLength = Waveform.textureLength
		let translateInt = Math.floor((translate) / sampleStep);
		let translateFract = (translate) / sampleStep - translateInt;

		// FIXME: bring cap login from shader here
		let offset = 0

		let count = Math.min(
			// number of visible texture sampling points
			// 2. * Math.floor((dataLength * Math.max(0, (2 + Math.min(currTexture, 0))) - (translate % dataLength)) / sampleStep),

			// number of available data points
			// 2 * Math.round((this.total - Math.max(translate[0], 0)) / sampleStep),

			// number of visible vertices on the screen
			2 * Math.ceil(viewport[2] / pxStep),

			// number of ids available
			Waveform.maxSampleCount
		)


		// FIXME: samplePerStep <1 and >1 gives sharp zoom transition
		if (sampleStep > 1) {
			// console.log('range')
			this.shader.drawRanges.call(this, {
				offset, count, thickness, color, pxStep, viewport, span, translate, translateInt, translateFract, currTexture, sampleStep,
				// color: [255,0,0,10],
			})
			// this.shader.drawRanges.call(this, {
			// 	primitive: 'points',
			// 	offset, count, thickness, color, pxStep, viewport, span, translate, translateInt, translateFract, currTexture, sampleStep,
			// 	color: [0,0,0,255]
			// })
		}
		else {
			// console.log('line')
			this.shader.drawLine.call(this, {
				offset, count, thickness, color, pxStep, viewport, span, translate, translateInt, translateFract, currTexture, sampleStep,
				// thickness: 1,
			})
			// this.shader.drawLine.call(this, {
			// 	primitive: 'points',
			// 	offset, count, thickness, color, pxStep, viewport, span, translate, translateInt, translateFract, currTexture, sampleStep,
			// 	color: [0,0,0,255],
			// 	thickness: 0,
			// })
			// this.shader.drawLine.call(this, {
			// 	primitive: 'points',
			// 	offset, count, thickness, color, pxStep, viewport, span, translate, translateInt, translateFract, currTexture, sampleStep,
			// 	color: [0,0,0,255],
			// 	thickness: 0,
			// })
		}
	}

	this.regl = this.shader.regl
	this.canvas = this.gl.canvas

	// stack of textures with sample data
	this.textures = []

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
		})(Waveform.maxSampleCount)
	})

	let shaderOptions = {
		primitive: (c, p) => p.primitive || 'triangle strip',
		offset: regl.prop('offset'),
		count: regl.prop('count'),
		frag: `
		precision highp float;
		uniform float textureId;
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
			dataShape: Waveform.textureSize,
			dataLength: Waveform.textureLength,
			textureId: regl.prop('currTexture'),

			// total number of samples
			total: regl.this('total'),

			// number of pixels between sampling
			pxStep: regl.prop('pxStep'),
			// number of samples per pixel sampling step
			sampleStep: regl.prop('sampleStep'),
			viewport: regl.prop('viewport'),
			span: regl.prop('span'),
			translate: regl.prop('translate'),
			translateInt: regl.prop('translateInt'),
			translateFract: regl.prop('translateFract'),

			opacity: regl.this('opacity'),
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
			box: regl.this('viewport')
		},
		viewport: regl.this('viewport'),
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
		channels: Waveform.textureChannels,
		type: 'float'
	})

	return { drawRanges, drawLine, regl, idBuffer, blankTexture }
}

Waveform.prototype.update = function (o) {
	if (!o) return this
	o = pick(o, {
		data: 'data value values amp amplitude amplitudes sample samples',
		push: 'add append push insert concat',
		range: 'range dataRange dataBox dataBounds limits',
		max: 'max maxAmp maxAmplitude',
		min: 'min minAmp minAmplitude',
		thickness: 'thickness width linewidth lineWidth line-width',
		pxStep: 'step pxStep',
		color: 'color colour colors colours fill fillColor fill-color',
		line: 'line line-style lineStyle linestyle',
		viewport: 'vp viewport viewBox viewbox viewPort',
		opacity: 'opacity alpha transparency visible visibility opaque'
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
		// FIXME: parse non-px values
		this.thickness = parseFloat(o.thickness)
	}

	if (o.pxStep != null) {
		// FIXME: parse non-px values
		this.pxStep = parseFloat(o.pxStep)
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


	// custom/default visible data window
	if (o.range != null) {
		if (o.range.length === 2) {
			o.range = [o.range[0], -1, o.range[1], 1]
		}
		else if (o.range.length === 4) {
			o.range = o.range.slice()
		}
		else if (typeof o.range === 'number') {
			o.range = [-o.range, -1, -0, 1]
		}

		// FIXME: limit zoom level by 1 texture
		// if (o.range[2] - o.range[0] > Waveform.textureLength) {
		// 	if (!this.range) {
		// 		o.range[0] = -Waveform.textureLength
		// 		o.range[2] = -0
		// 	}
		// 	else {
		// 		// FIXME: check if this is ok way to limit zoom
		// 		o.range[0] = this.range[0]
		// 		o.range[2] = this.range[0] + Waveform.textureLength
		// 	}
		// }

		this.range = o.range
	}

	if (!this.range && !o.range) {
		this.range = [0, -1, Math.min(this.viewport.width, Waveform.textureLength), 1]
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
}

// put new samples into texture
Waveform.prototype.push = function (samples) {
	if (!samples || !samples.length) return

	if (Array.isArray(samples)) {
		let floatSamples = pool.mallocFloat(samples.length)
		floatSamples.set(samples)
		samples = floatSamples
	}

	let [txtW, txtH] = Waveform.textureSize
	let txtLen = Waveform.textureLength

	let offset = this.total % txtLen
	let id = Math.floor(this.total / txtLen)
	let y = Math.floor(offset / txtW)
	let x = offset % txtW
	let tillEndOfTxt = txtLen - offset
	let ch = Waveform.textureChannels

	// get current texture
	let txt = this.textures[id], prevTxt = this.textures[id - 1]
	if (!txt) {
		txt = this.textures[id] = this.regl.texture({
			width: Waveform.textureSize[0],
			height: Waveform.textureSize[1],
			channels: Waveform.textureChannels,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			// min: 'linear',
			// mag: 'linear',
			wrap: ['clamp', 'clamp']
		})
		txt.sum = txt.sum2 = 0
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = pool.mallocFloat(dataLen * ch)
	for (let i = 0, l = dataLen; i < l; i++) {
		data[i * ch] = samples[i]
		txt.sum += samples[i]
		txt.sum2 += samples[i] * samples[i]
		data[i * ch + 1] = txt.sum
		data[i * ch + 2] = txt.sum2
		// data[i * ch + 3] = f32.fract(txt.sum2)
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
			pool.freeFloat(samples)
			pool.freeFloat(data)
			return
		}

		y++

		// shortcut next texture block
		if (y === txtH) {
			pool.freeFloat(data)
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

		pool.freeFloat(samples)
		pool.freeFloat(data)

		return
	}
}

Waveform.prototype.destroy = function () {
	this.textures.forEach(txt => txt.destroy())
}


Waveform.prototype.color = new Uint8Array([0,0,0,255])
Waveform.prototype.opacity = 1
Waveform.prototype.thickness = 1
Waveform.prototype.viewport = null
Waveform.prototype.range = null


// Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures
Waveform.textureSize = [64, 64]
Waveform.textureChannels = 3
Waveform.textureLength = Waveform.textureSize[0] * Waveform.textureSize[1]
Waveform.maxSampleCount = 8192


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


module.exports = Waveform
