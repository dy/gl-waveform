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


let shaderCache = new WeakMap()


class Waveform {
	constructor (o) {
		if (isRegl(o)) {
			o = {regl: o}
			this.gl = o.regl._gl
		}
		else {
			this.gl = createGl(o)
		}

		this.shader = shaderCache.get(this.gl)
		if (!this.shader) {
			this.shader = this.createShader(o)
			shaderCache.set(this.gl, this.shader)
		}

		// total number of samples
		this.total = 0

		// last sum value
		this.sum = 0

		// last sum2 value
		this.sum2 = 0

		// pixels step per sample
		this.step = 1

		// this.render = this.shader.draw.bind(this)
		this.render = function () {
			this.shader.draw.call(this)
		}
		this.regl = this.shader.regl
		this.canvas = this.gl.canvas

		// stack of textures with samples
		this.textures = []

		this.update(isObj(o) ? o : {})
	}

	// create waveform shader, called once per gl context
	createShader (o) {
		let regl = o.regl || createRegl({
			gl: this.gl,
			extensions: 'oes_texture_float'
		})

		let idBuffer = regl.buffer({
			usage: 'static',
			type: 'int16',
			data: (N => {
				let x = Array(N*4)
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
			primitive: 'points',
			// primitive: 'line strip',
			// primitive: 'triangle strip',
			offset: 0,
			count: function (ctx) {
				return 2 * Math.ceil(ctx.viewportWidth / this.step)
			},

			vert: glsl('./line-vert.glsl'),
			// vert: `
			// precision highp float;
			// varying vec4 fragColor;
			// void main() {
			// 	gl_PointSize = 10.;
			// 	gl_Position = vec4(0,0,0,1);
			// 	fragColor = vec4(0,0,0,1);
			// }
			// `,
			frag: `
			precision highp float;
			varying vec4 fragColor;
			void main() {
				gl_FragColor = fragColor;
			}
			`,


			uniforms: {
				data: function (ctx) {
					let id = 0//Math.floor(prop.range[0] / txtLen)
					return this.textures[id]
				},
				dataShape: Waveform.textureSize,
				step: regl.this('step'),
				opacity: regl.this('opacity'),
				count: function (ctx) {
					return this.range[1] - this.range[0]
				},
				offset: function (ctx) {
					return nidx(this.range[0], this.total)
				},
				viewport: function (ctx) {
					if (!this.viewport) return [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight]

					return [this.viewport.x, this.viewport.y, ctx.viewportWidth, ctx.viewportHeight]
				}
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

		return { draw, regl, idBuffer}
	}

	update (o) {
		o = pick(o, {
			data: 'data value values amp amplitude amplitudes sample samples',
			push: 'add append push insert concat',
			range: 'range dataRange dataBox dataBounds limits',
			thickness: 'thickness width linewidth lineWidth line-width',
			color: 'color colour colors colours fill fillColor fill-color',
			viewport: 'vp viewport viewBox viewbox viewPort',
			opacity: 'opacity alpha transparency visible visibility opaque'
		})

		if (o.thickness != null) {
			this.thickness = parseFloat(o.thickness)

			// make sure we do not create line creases
			this.step = Math.max(this.thickness, this.step)
		}

		if (o.opacity != null) {
			this.opacity = parseFloat(o.opacity)
		}

		if (o.viewport != null) {
			this.viewport = parseRect(o.viewport)
		}
		if (!this.viewport) {
			this.viewport = [0, 0, this.canvas.width, this.canvas.height]
		}

		// custom/default visible data window
		if (o.range != null) {
			if (o.range.length === 2) {
				this.range = [o.range[0], -1, o.range[1], 1]
			}
			else if (o.range.length === 4) {
				this.range = o.range.slice()
			}
			else if (typeof o.range === 'number') {
				this.range = [-o.range, -1, 0, 1]
			}
		}
		if (!this.range) this.range = [-this.viewport.width, -1, 0, 1]


		// flatten colors to a single uint8 array
		if (o.color != null) {
			if (!o.color) o.color = 'transparent'

			// single color
			if (typeof o.color === 'string') {
				this.color = rgba(o.color, 'uint8')
			}
			// flat array
			else if (typeof o.color[0] === 'number') {
				let l = o.color.length
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
			this.sum = 0
			this.sum2 = 0
			this.push(o.data)
		}

		// call push method
		if (o.push) {
			this.push(o.push)
		}
	}

	// put new samples into texture
	push (samples) {
		if (!samples || !samples.length) return update

		// we use subarrays later, as well as data is anyways always
		if (Array.isArray(samples)) {
			let floatSamples = pool.mallocFloat(samples.length)
			floatSamples.set(samples)
			samples = floatSamples
		}

		let [txtW, txtH] = Waveform.textureSize
		let txtLen = txtW * txtH

		let offset = this.total % txtLen
		let id = Math.floor(this.total / txtLen)
		let y = Math.floor(offset / txtW)
		let x = offset % txtW
		let tillEndOfTxt = txtLen - offset

		// calc sum, sum2 and form data for the samples
		let dataLen = Math.min(tillEndOfTxt, samples.length)
		let data = pool.mallocFloat(dataLen * 3)
		let lastSum = this.sum, lastSum2 = this.sum2
		for (let i = 0, l = dataLen; i < l; i++) {
			data[i * 3] = samples[i]
			data[i * 3 + 1] = lastSum += samples[i]
			data[i * 3 + 2] = lastSum2 += samples[i] * samples[i]
		}
		this.sum = lastSum, this.sum2 = lastSum2, this.total += dataLen

		// get current texture
		let txt = this.textures[id]
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
		}

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
			pool.freeFloat(samples)
			pool.freeFloat(data)
			return this.push(samples.subarray(tillEndOfTxt))
		}
	}

	destroy () {
		this.textures.forEach(txt => txt.destroy())
	}
}


Waveform.prototype.log = false
Waveform.prototype.color = 'black'
Waveform.prototype.thickness = 2
Waveform.prototype.viewport = null
Waveform.prototype.range = null


Waveform.textureSize = [1024, 1024]


function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}


module.exports = Waveform
