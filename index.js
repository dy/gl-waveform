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

	this.render = function (a, b, c) {
		let r = this.range

		// calc runtime props
		let viewport
		if (!this.viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight]
		else viewport = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]

		let step = this.step || this.thickness * this.thicknessStepRatio
		let minStep = 2 * viewport[2] / Math.abs(r[2] - r[0])
		step = Math.max(step, minStep)

		let scale
		if (!r) scale = [1 / viewport.width, 1 / viewport.height]
		else scale = [
			1 / (r[2] - r[0]),
			1 / (r[3] - r[1])
		]

		let translate = !r ? [0, 0] : [r[0], r[2]]

		// update current texture
		let currTexture = Math.floor(r[0] / Waveform.textureLength)

		let samplesPerStep = .5 * step / scale[0] / viewport[2]

		this.shader.draw.call(this, {
			step, viewport, scale, translate, currTexture, samplesPerStep
		})
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
		})(4096)
	})

	let draw = regl({
		// primitive: 'points',
		// primitive: 'line strip',
		primitive: 'triangle strip',
		offset: 0,

		count: function (c, p) {
			let step = p.step || this.thickness * this.thicknessStepRatio
			return 4 * Math.ceil(p.viewport[2] / step) + 4.
		},

		vert: glsl('./line-vert.glsl'),

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

			// total number of samples
			total: regl.this('total'),

			// number of pixels between sampling
			step: regl.prop('step'),
			// number of samples per pixel sampling step
			samplesPerStep: regl.prop('samplesPerStep'),
			viewport: regl.prop('viewport'),
			scale: regl.prop('scale'),
			translate: regl.prop('translate'),
			textureId: regl.prop('currTexture'),

			opacity: regl.this('opacity'),
			color: regl.this('color'),
			thickness: regl.this('thickness')
			// color: regl.prop('color'),
			// thickness: regl.prop('thickness')
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
			enable: false
		},

		scissor: {
			enable: true,
			box: regl.this('viewport')
		},
		viewport: regl.this('viewport'),
		stencil: false
	})

	let blankTexture = regl.texture({
		width: 1,
		height: 1,
		channels: 3,
		type: 'float'
	})

	return { draw, regl, idBuffer, blankTexture }
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
		step: 'step pxStep',
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

	if (o.step != null) {
		// FIXME: parse non-px values
		this.step = parseFloat(o.step)
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

		// limit zoom level by 1 texture
		if (o.range[2] - o.range[0] > Waveform.textureLength) {
			if (!this.range) {
				o.range[0] = -Waveform.textureLength
				o.range[2] = -0
			}
			else {
				// FIXME: check if this is ok way to limit zoom
				o.range[0] = this.range[0]
				o.range[2] = this.range[0] + Waveform.textureLength
			}
		}

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

	// get current texture
	let txt = this.textures[id], prevTxt = this.textures[id - 1]
	if (!txt) {
		txt = this.textures[id] = this.regl.texture({
			width: Waveform.textureSize[0],
			height: Waveform.textureSize[1],
			channels: 3,
			type: 'float',
			min: 'nearest',
			mag: 'nearest',
			wrap: ['clamp', 'clamp']
		})
		txt.sum = txt.sum2 = 0
	}

	// calc sum, sum2 and form data for the samples
	let dataLen = Math.min(tillEndOfTxt, samples.length)
	let data = pool.mallocFloat(dataLen * 3)
	for (let i = 0, l = dataLen; i < l; i++) {
		data[i * 3] = samples[i]
		txt.sum += samples[i]
		txt.sum2 += samples[i] * samples[i]
		data[i * 3 + 1] = txt.sum
		data[i * 3 + 2] = txt.sum2
	}
	this.total += dataLen

	// fullfill last unfinished row
	let firstRowWidth = 0
	if (x) {
		firstRowWidth = Math.min(txtW - x, dataLen)
		txt.subimage({
			width: firstRowWidth,
			height: 1,
			data: data.subarray(0, firstRowWidth * 3)
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
			data: data.subarray(firstRowWidth * 3, (firstRowWidth + blockLen) * 3)
		}, 0, y)
		y += h
	}

	// put last row
	let lastRowWidth = dataLen - firstRowWidth - blockLen
	if (lastRowWidth) {
		txt.subimage({
			width: lastRowWidth,
			height: 1,
			data: data.subarray(-lastRowWidth * 3)
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
Waveform.prototype.thicknessStepRatio = 2


// Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures
Waveform.textureSize = [512, 512]
Waveform.textureLength = Waveform.textureSize[0] * Waveform.textureSize[1]


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
