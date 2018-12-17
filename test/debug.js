'use strict'

// debug version with direct shader, calculated in js instead of glsl

let Waveform = require('../index')
let f32 = require('to-float32')

let origCreateShader = Waveform.prototype.createShader
Waveform.prototype.createShader = function () {
	let result = origCreateShader.apply(this, arguments)
	let regl = result.regl

	// debugger fn
	result.drawDirect = regl({
		// outputs diect positions calculated in debugging purposes
		vert: `
			precision highp float;

			attribute vec2 position;

			uniform float opacity;
			uniform vec4 color;

			varying vec4 fragColor;

			void main() {
				gl_PointSize = 5.5;

				fragColor = color / 255.;
				fragColor.a *= opacity;

				gl_Position = vec4(position * 2. - 1., 0, 1.);
			}
		`,
		frag: `
			precision highp float;
			varying vec4 fragColor;
			void main() {
				gl_FragColor = fragColor;
			}
		`,

		primitive: (c, p) => p.primitive || 'triangle strip',
		offset: regl.prop('offset'),
		count: regl.prop('count'),

		uniforms: {
			opacity: regl.prop('opacity'),
			color: regl.prop('color')
		},
		attributes: {
			position: regl.prop('position')
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
	})

	return result
}

// shader code is generated via glsl-transpiler from range.glsl
Waveform.prototype.render = function () {
	let o = this.calc()
	if (!this.textures.length) return
	let positions = [], ids = Array(o.count).fill(0).map((v, i) => i)
	let {opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, translateri, translateriFract, translater, translatei, translates, amplitude, viewport, color, currTexture} = o
	let sampleStepRatio = 1/sampleStep;

	let samples = this.textures[currTexture] || this.blankTexture
	let fractions = this.textures2[currTexture] || this.blankTexture
	fractions._data = f32.fract(samples.data)
	samples._data = f32.float(samples.data)
	let texLen = this.textureLength

	var avgCurr, avgNext, avgPrev, avgMin, avgMax, sdev, normThickness, fragColor;
	let ch = this.textureChannels

sampleStep = f32(sampleStep)
	ids.forEach((id) => {
		normThickness = thickness / viewport[3];
		fragColor = [color[0] / 255., color[1] / 255., color[2] / 255., color[3] / 255.];
		fragColor[3] *= opacity;
		var offset = id * sampleStep;
		var posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;
		var isPrevStart = id == 1.;
		var isStart = id <= 0.;
		var isEnd = id >= (floor(totals - translates - 1.));
		var baseOffset = offset - sampleStep * 2.;
		var offset0 = offset - sampleStep;
		var offset1 = offset;
		if (isEnd) {
		offset = total - 1.;
		};
		var sample0 = pick(samples, offset0, baseOffset, translateri);
		var sample1 = pick(samples, offset1, baseOffset, translateri);
		var samplePrev = pick(samples, baseOffset, baseOffset, translateri);
		var sampleNext = pick(samples, offset + sampleStep, baseOffset, translateri);
		avgPrev = baseOffset < 0. ? sample0[0] : (sample0[1] - samplePrev[1]) / sampleStep;
		avgNext = (sampleNext[1] - sample1[1]) / sampleStep;
		var offset0l = floor(offset0);
		var offset1l = floor(offset1);
		var t0 = f32(offset0 - offset0l);
		var t1 = f32(offset1 - offset1l);
		var offset0r = offset0l + 1.;
		var offset1r = offset1l + 1.;
		var sample0l = f32(pick(samples, offset0l, baseOffset, translateri));
		var sample0r = f32(pick(samples, offset0r, baseOffset, translateri));
		var sample1r = f32(pick(samples, offset1r, baseOffset, translateri));
		var sample1l = f32(pick(samples, offset1l, baseOffset, translateri));
		var sample1lf = f32(pick(fractions, offset1l, baseOffset, translateri));
		var sample0lf = f32(pick(fractions, offset0l, baseOffset, translateri));
		var sample1rf = f32(pick(fractions, offset1r, baseOffset, translateri));
		var sample0rf = f32(pick(fractions, offset0r, baseOffset, translateri));
		if (isStart) {
		avgCurr = sample1[0];
		} else {
		if (isPrevStart) {
		avgCurr = (sample1[1] - sample0[1]) / sampleStep;
		} else {
		avgCurr = f32(f32(
			+ f32(sample1l[1] - sample0l[1])
			+ f32(sample1lf[1] - sample0lf[1])
			+ f32(t1 * (f32(sample1r[1] - sample1l[1])))
			- f32(t0 * (f32(sample0r[1] - sample0l[1])))
			+ f32(t1 * (f32(sample1rf[1] - sample1lf[1])))
			- f32(t0 * (f32(sample0rf[1] - sample0lf[1])))
		) / sampleStep);
		};
		};
		var mx2 = (
			+sample1l[2] - sample0l[2]
			+ sample1lf[2] - sample0lf[2]
			+ t1 * (sample1r[2] - sample1l[2])
			- t0 * (sample0r[2] - sample0l[2])
			+ t1 * (sample1rf[2] - sample1lf[2])
			- t0 * (sample0rf[2] - sample0lf[2])
		) / sampleStep;
		var m2 = avgCurr * avgCurr;
		var variance = abs(mx2 - m2);
		variance = 0.;
		// FIXME: variance is wroooong
		variance = 0;
		sdev = sqrt(variance);
		sdev /= abs(amplitude[1] - amplitude[0]);
		avgCurr = reamp(avgCurr, amplitude);
		avgNext = reamp(avgNext, amplitude);
		avgPrev = reamp(avgPrev, amplitude);
		var position = [(pxStep * (id - posShift)) / viewport[2], avgCurr];
		var x = pxStep / viewport[2];
		var normalLeft = normalize([(-(avgCurr - avgPrev)) / viewport[2], x / viewport[3]]);
		var normalRight = normalize([(-(avgNext - avgCurr)) / viewport[2], x / viewport[3]]);
		var bisec = normalize([normalLeft[0] + normalRight[0], normalLeft[1] + normalRight[1]]);
		var vert = [0, 1];
		var bisecLen = abs(1. / (dot(normalLeft, bisec)));
		var vertRightLen = abs(1. / (dot(normalRight, vert)));
		var vertLeftLen = abs(1. / (dot(normalLeft, vert)));
		var maxVertLen = max(vertLeftLen, vertRightLen);
		var minVertLen = min(vertLeftLen, vertRightLen);
		var vertSdev = (2. * sdev) / normThickness;
		var join = [0, 0];
		if (isStart || isPrevStart) {
		join = normalRight;
		} else {
		if (isEnd) {
		join = normalLeft;
		} else {
		if (vertSdev < maxVertLen) {
		if (vertSdev > minVertLen) {
		var t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);
		join = lerp([bisec[0] * bisecLen, bisec[1] * bisecLen], [vert[0] * maxVertLen, vert[1] * maxVertLen], t);
		} else {
		join = [bisec[0] * bisecLen, bisec[1] * bisecLen];
		};
		} else {
		join = [vert[0] * vertSdev, vert[1] * vertSdev];
		};
		};
		};

		var side
		side=-1
		avgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);
		avgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);
		positions.push(position[0] + (((1 * join[0]) * .5) * thickness) / viewport[2], position[1] + (((1 * join[1]) * .5) * thickness) / viewport[3]);
		positions.push(position[0] + (((-1 * join[0]) * .5) * thickness) / viewport[2], position[1] + (((-1 * join[1]) * .5) * thickness) / viewport[3]);

		side=1
		positions.push(position[0] + (((1 * join[0]) * .5) * thickness) / viewport[2], position[1] + (((1 * join[1]) * .5) * thickness) / viewport[3]);
		positions.push(position[0] + (((-1 * join[0]) * .5) * thickness) / viewport[2], position[1] + (((-1 * join[1]) * .5) * thickness) / viewport[3]);
	})

	o.position = positions

	this.shader.drawDirect.call(this, o)





	function floor (x) {
		if (x.length) { return x.map(floor); }
		return Math.floor(x);
	}
	function abs (x) {
		if (x.length) { return x.map(abs); }
		return Math.abs(x);
	}
	function sqrt (x) {
		if (x.length) { return x.map(sqrt); }
		return Math.sqrt(x);
	}
	function normalize (x) {
		var len = 0;
		for (var i = 0; i < x.length; i++) {
			len += x[i]*x[i];
		}

		var out = Array(x.length).fill(0);
		if (len > 0) {
			len = 1 / Math.sqrt(len);
			for (var i = 0; i < x.length; i++) {
				out[i] = x[i] * len;
			}
		}
		return out;
	}
	function dot (x, y) {
		var sum = 0;
		for (var i = 0; i < x.length; i++) {
			sum += x[i]*y[i];
		}
		return sum;
	}
	function max (x, y) {
		if (x.length) {
			if (y.length) { return x.map(function (x, i) {
				return Math.max(x, y[i]);
			}); }
			return x.map(function (x, i) {
				return Math.max(x, y);
			});
		}
		return Math.max(x, y);
	}
	function min (x, y) {
		if (x.length) {
			if (y.length) { return x.map(function (x, i) {
				return Math.min(x, y[i]);
			}); }
			return x.map(function (x, i) {
				return Math.min(x, y);
			});
		}
		return Math.min(x, y);
	}
	function lerp (a, b, t) {
		return [t * b[0] + (1. - t) * a[0], t * b[1] + (1. - t) * a[1], t * b[2] + (1. - t) * a[2], t * b[3] + (1. - t) * a[3]];
	}
	function reamp(v, amp) {
		return (v - amp[0]) / (amp[1] - amp[0])
	}


	function _pick (tex, offset) {
		offset = max(offset, 0.);
		if (!tex._data) return [0,0,0,0]

		return tex._data.subarray(offset * ch, offset * ch + ch)
	}
	function pick (tex, offset) {
		let offsetLeft = Math.floor(offset);
		let offsetRight = Math.ceil(offset);
		let t = offset - offsetLeft;
		if (offsetLeft == offsetRight) {
			offsetRight = Math.ceil(offset + .5);
			t = 0.;
		}

		let left = _pick(tex, offsetLeft);
		let right = _pick(tex, offsetRight);

		if (t == 0.) {
			return left
		}

		let res = lerp(left, right, t)

		return res
	}

}


module.exports = Waveform
