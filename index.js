'use strict'

import pick from 'pick-by-alias'
import extend from 'object-assign'
import glsl from 'glslify'
import nidx from 'negative-index'
import WeakMap from 'es6-weak-map'
import createRegl from 'regl'
import parseRect from 'parse-rect'
import GlComponent from '@a-vis/gl-component'


class Waveform extends GlComponent {
	constructor (options) {
		super(options)

		const txtH = 1024

		let gl = regl._gl,
			drawLine, drawFill,
			colorTexture, idBuffer, dataTextures = [],
			state = {
				total: 0,
				sum: 0,
				sum2: 0,
				pxStep: 1
			}, defaults = {
				log: false,
				color: 'black',
				thickness: 2,
				viewport: null,
				range: null,
				samples: null
			}

		idBuffer = regl.buffer({
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

		// colorTexture = regl.texture({
		// 	width: 256,
		// 	height: 1,
		// 	type: 'uint8',
		// 	format: 'rgba',
		// 	mag: 'linear',
		// 	min: 'linear'
		// })

		let shaderOptions

		update(extend({}, defaults, options))

		return waveform
	}


	// called once per regl instance
	createShader (opts) {
		drawLine = createRegl({
			// primitive: 'points',
			// primitive: 'line strip',
			primitive: 'triangle strip',
			offset: 0,

			frag: glsl('./line-frag.glsl'),
			vert: glsl('./line-vert.glsl'),

			count: (ctx, prop) => {
				return 2 * Math.ceil(ctx.viewportWidth / prop.pxStep)
			},

			uniforms: {
				data: (ctx, prop) => {
					let id = 0//Math.floor(prop.range[0] / txtLen)
					return dataTextures[id]
				},
				dataShape: [txtH, txtH],
				pxStep: regl.prop('pxStep'),
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
	}

	update (o) {
		// init opacity, color[s], viewport
		super.update(o)

		o = pick(o, {
			data: 'samples data amplitudes values',
			append: 'add append push insert concat',
			range: 'range dataRange dataBox dataBounds limits',
			color: 'color colour colors colours fill fillColor fill-color',
			thickness: 'thickness linewidth lineWidth line-width width'
		})

		if (o.thickness != null) {
			this.thickness = parseFloat(o.thickness)

			// make sure we do not create line creases
			this.pxStep = Math.max(this.thickness, this.pxStep)
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

		//reset sample textures if new samples data passed
		if (o.data) {
			this.samplesTexture.dispose()
			this.total = 0
			this.push(s)
		}

		return waveform
	}


	push (samples) {
		if (!samples || !samples.length) return update

		// we decrease texture width by 2 in order to provide first and last column to keep interpolation on the edgest
		let offset = state.total % txtLen
		let id = Math.floor(state.total / txtLen)
		let y = Math.floor(offset / txtW)
		let tillEndOfTxt = txtLen - offset

		//calc sum, sum2 and form data for the samples
		let dataLen = Math.min(tillEndOfTxt, samples.length)
		let data = new Float32Array(dataLen * 3)
		let lastSum = state.sum, lastSum2 = state.sum2
		for (let i = 0, l = dataLen; i < l; i++) {
			data[i * 3] = samples[i]
			data[i * 3 + 1] = lastSum += samples[i]
			data[i * 3 + 2] = lastSum2 += samples[i] * samples[i]
		}
		state.sum = lastSum, state.sum2 = lastSum2, state.total += dataLen

		//get current texture
		let txt = dataTextures[id]
		if (!txt) {
			txt = dataTextures[id] = createTexture()
		}

		//fullfill last row
		let rowOffset = offset % txtW
		let rowWidth = 0
		if (rowOffset) {
			rowWidth = Math.min(txtW - rowOffset, dataLen)
			txt.subimage({
				width: rowWidth,
				height: 1,
				data: data.subarray(0, rowWidth * 3)
			}, rowOffset + 1, y)

			//if data is shorter than the texture row - skip the rest
			if (rowOffset + samples.length <= txtW) return update

			y++

			//put the first interpolation pixel to the next row
			txt.subimage({
				width: 1, height: 1,
				data: data.subarray((rowWidth - 1) * 3, rowWidth * 3)
			}, 0, y)

			//shortcut next texture block
			if (y === txtH) return push(samples.slice(rowWidth))

			offset += rowWidth
		}

		//put rect with data
		let h = Math.ceil((dataLen - rowWidth) / txtW)
		let block = new Float32Array(txtW * h * 3)
		block.set(data.slice(rowWidth * 3, dataLen * 3))
		txt.subimage({
			width: txtW,
			height: h,
			data: block
		}, 1, y)

		//put left/right columns for interpolation
		let rightCol = new Float32Array(h * 3)
		for (let i = 0; i < h; i++) {
			let firstId = i * txtW
			rightCol[i * 3] = block[firstId * 3]
			rightCol[i * 3 + 1] = block[firstId * 3 + 1]
			rightCol[i * 3 + 2] = block[firstId * 3 + 2]
		}
		if (!y) {
			if (h > 1) {
				txt.subimage({
					width: 1, height: h - 1,
					data: rightCol.subarray(3)},
				txtW + 1, 0)
			}
			//put prev txt last pixel
			if (id) {
				let prevTxt = dataTextures[id-1]
				prevTxt.subimage({
					width: 1, height: 1,
					data: rightCol.subarray(0, 3)},
				txtW + 1, txtH - 1)
			}
		}
		else {
			txt.subimage({width: 1, height: h, data: rightCol}, txtW + 1, y-1)
		}
		let leftCol = new Float32Array(h * 3)
		for (let i = 0; i < h; i++) {
			let lastId = (txtW - 1 + txtW * i)
			leftCol[i * 3] = block[lastId * 3]
			leftCol[i * 3 + 1] = block[lastId * 3 + 1]
			leftCol[i * 3 + 2] = block[lastId * 3 + 2]
		}
		if (y + h === txtH) {
			txt.subimage({
				width: 1, height: h - 1,
				data: leftCol.subarray(0, -3)},
			0, y + 1)
			//put first px of the next texture
			let nextTxt = dataTextures[id + 1] = createTexture()
			nextTxt.subimage({
				width: 1, height: 1,
				data: leftCol.subarray(-3)},
			0, 0)
		}
		else {
			txt.subimage({width: 1, height: h, data: leftCol}, 0, y + 1)
		}


		//shorten block till the end of texture
		if (tillEndOfTxt < samples.length) {
			return push(samples.slice(tillEndOfTxt))
		}

		return update

		function createTexture() {
			return regl.texture({
				shape: [txtH, txtH, 3],
				type: 'float',
				min: 'nearest',
				mag: 'nearest',
				wrap: ['clamp', 'clamp']
			})
		}
	}


	destroy () {
		idBuffer.dispose()
		colorTexture.dispose()
		dataTextures.forEach(txt => txt.dispose())
		dataTextures.length = 0
		positionBuffer.destroy()
	}
}


Waveform.cache = new WeakMap()


