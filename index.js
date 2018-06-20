'use strict'


import pick from 'pick-by-alias'
import extend from 'object-assign'
import glsl from 'glslify'
import nidx from 'negative-index'
import WeakMap from 'es6-weak-map'
import createRegl from 'regl'
import parseRect from 'parse-rect'
import createGl from 'gl-util/context'
import isObj from 'is-plain-obj'
import pool from 'typedarray-pool'


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


		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.canvas = this.gl.canvas
		this.shader = shader

		// stack of textures with samples
		this.textures = []

		this.update(isPlainObj(o) ? o : {})
	}

	// create waveform shader, called once per gl context
	createShader (o) {
		let regl = o.regl || createRegl({ gl: this.gl })

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
			// primitive: 'points',
			// primitive: 'line strip',
			primitive: 'triangle strip',
			offset: 0,

			frag: glsl('./line-frag.glsl'),
			vert: glsl('./line-vert.glsl'),

			count: (ctx, prop) => {
				return 2 * Math.ceil(ctx.viewportWidth / prop.step)
			},

			uniforms: {
				data: (ctx, prop) => {
					let id = 0//Math.floor(prop.range[0] / txtLen)
					return dataTextures[id]
				},
				dataShape: [txtH, txtH],
				step: regl.prop('step'),
				minDb: regl.prop('minDb'),
				maxDb: regl.prop('maxDb'),
				logarithmic: regl.prop('log'),
				// color: colorTexture,
				opacity: regl.prop('opacity'),
				count: (ctx, prop) => prop.range[1] - prop.range[0],
				offset: (ctx, prop) => nidx(prop.range[0], prop.total),
				viewport: (ctx, prop) => [prop.viewport.x, prop.viewport.y, ctx.viewportWidth, ctx.viewportHeight]
			},

			attributes: {
				id: {
					buffer: idBuffer,
					stride: 4,
					offset: 0
				},
				ampSign: {
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
				box: regl.prop('viewport')
			},
			viewport: regl.prop('viewport'),
			stencil: false
		})

		return { draw, regl, idBuffer}
	}

	update (o) {
		o = pick(o, {
			color: 'color colour colors colours',
			viewport: 'vp viewport viewBox viewbox viewPort',
			opacity: 'opacity alpha transparency visible visibility opaque',
			data: 'samples data amplitudes values',
			push: 'add append push insert concat',
			range: 'range dataRange dataBox dataBounds limits',
			color: 'color colour colors colours fill fillColor fill-color',
			thickness: 'thickness width linewidth lineWidth line-width'
		})

		if (o.thickness != null) {
			this.thickness = parseFloat(o.thickness)

			// make sure we do not create line creases
			this.step = Math.max(this.thickness, this.step)
		}

		// custom/default visible data window
		if (o.range != null) {
			if (o.range.length === 2) {
				this.range = [o.range[0], -1, o.range[1], 1]
			}
			else if (o.range.length === 4) {
				this.range = o.range
			}
			else if (typeof o.range === 'number') {
				this.range = [-o.range, -1, 0, 1]
			}
		}
		else {
			this.range = null
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
				this.color = new Uint8Array(l)
				let sub = (o.color.subarray || o.color.slice).bind(o.color)
				for (let i = 0; i < l; i++) {
					this.color.set(rgba(sub(i * 4, i * 4 + 4), 'uint8'), i * 4)
				}
			}
			// nested array
			else {
				let l = o.color.length
				this.color = new Uint8Array(l * 4)
				for (let i = 0; i < l; i++) {
					this.color.set(rgba(o.color[i], 'uint8'), i * 4)
				}
			}
		}

		// reset sample textures if new samples data passed
		if (o.data) {
			this.sampleTexture.dispose()
			this.total = 0
			this.push(s)
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
			txt = this.textures[id] = regl.texture({
				shape: Waveform.textureSize,
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
				width: lastRowWidth
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
		this.sampleTexture.dispose()
	}
}


Waveform.prototype.log = false
Waveform.prototype.color = 'black'
Waveform.prototype.thickness = 2
Waveform.prototype.viewport = null
Waveform.prototype.range = null


Waveform.textureSize = [1024, 1024]


module.exports = Waveform
