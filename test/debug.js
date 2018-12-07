'use strict'

// debug version with direct shader, calculated in js instead of glsl

let Waveform = require('./')

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
				gl_PointSize = 1.5;

				fragColor = color / 255.;
				fragColor.a *= opacity;

				gl_Position = vec4(position * 2. - 1., 0, 1);
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

	let positions = [], ids = Array(o.count).fill(0).map((v, i) => i)
	let {opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates, sampleStepRatio, sampleStepRatioFract, viewport, color, amp, currTexture} = o
	let tex0 = this.textures[currTexture] || this.blankTexture
	let tex1 = this.textures[currTexture + 1] || this.blankTexture
	let texLen = this.textureLength

	ids.forEach((id) => {
		var avgPrev = 0, avgCurr = 0, avgNext = 0, sdev = 0;

		var offset = id * sampleStep + translateri;
		var posShift = pxPerSample < 1. ? 0. : id + (translater - offset) / sampleStep;
		var isStart = id <= -translates;
		var isEnd = id >= floor(totals - translates - 1.);
		var baseOffset = offset - sampleStep * 2.;
		var offset0 = offset - sampleStep;
		var offset1 = offset;
		var sample0 = isStart ? [0, 0, 0, 0] : pick(offset0, baseOffset);
		var sample1 = pick(offset1, baseOffset);
		var samplePrev = pick(baseOffset, baseOffset);
		var sampleNext = pick(offset + sampleStep, baseOffset);
		avgCurr = isStart ? sample1[0] : summul(sample1[1], 0., -sample0[1], 0., sampleStepRatio, sampleStepRatioFract);
		avgPrev = baseOffset < 0. ? sample0[0] : summul(sample0[1], 0., -samplePrev[1], 0., sampleStepRatio, sampleStepRatioFract);
		avgNext = summul(sampleNext[1], 0., -sample1[1], 0., sampleStepRatio, sampleStepRatioFract);

		// var variance = abs(summul(sample1[2], sample1[3], -sample0[2], -sample0[3], sampleStepRatio, sampleStepRatioFract) - avgCurr * avgCurr);
		var offset0l = Math.floor(offset0)
		var offset1l = Math.floor(offset1)
		var t0 = offset0 - offset0l
		var t1 = offset1 - offset1l
		var ti0 = 1 - t0
		var ti1 = 1 - t1
		var offset0r = Math.ceil(offset0l + (t0 || .5))
		var offset1r = Math.ceil(offset1l + (t1 || .5))

		var variance = abs(
			// - sample0[2] * sampleStepRatio
			- _pick(offset0l)[2] * ti0 * sampleStepRatio
			- _pick(offset0r)[2] * t0 * sampleStepRatio
			// - sample0[3] * sampleStepRatio
			- _pick(offset0l)[3] * ti0 * sampleStepRatio
			- _pick(offset0r)[3] * t0 * sampleStepRatio

			// + sample1[2] * sampleStepRatio
			+ _pick(offset1l)[2] * ti1 * sampleStepRatio
			+ _pick(offset1r)[2] * t1 * sampleStepRatio
			// + sample1[3] * sampleStepRatio
			+ _pick(offset1l)[3] * ti1 * sampleStepRatio
			+ _pick(offset1r)[3] * t1 * sampleStepRatio

			- avgCurr * avgCurr
		)


		sdev = sqrt(variance);
		sdev /= abs(amp[1] - amp[0]);
		avgCurr = reamp(avgCurr, amp);
		avgNext = reamp(avgNext, amp);
		avgPrev = reamp(avgPrev, amp);
		var position = [(pxStep * (id - posShift)) / viewport[2], avgCurr];
		var x = pxStep / viewport[2];
		var normalLeft = normalize([-(avgCurr - avgPrev) / viewport[2], x / viewport[3]]);
		var normalRight = normalize([-(avgNext - avgCurr) / viewport[2], x / viewport[3]]);
		var bisec = normalize([normalLeft[0] + normalRight[0], normalLeft[1] + normalRight[1]]);
		var vert = [0, 1];
		var bisecLen = abs(1 / dot(normalLeft, bisec));
		var vertRightLen = abs(1 / dot(normalRight, vert));
		var vertLeftLen = abs(1 / dot(normalLeft, vert));
		var maxVertLen = max(vertLeftLen, vertRightLen);
		var minVertLen = min(vertLeftLen, vertRightLen);
		var vertSdev = 2. * sdev * viewport[3] / thickness;
		var join = [0, 0];

		if (isStart) {
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
		positions.push(
			[position[0] + join[0] * .5 * thickness / viewport[2],
			position[1] + join[1] * .5 * thickness / viewport[3]],
			[position[0] - join[0] * .5 * thickness / viewport[2],
			position[1] - join[1] * .5 * thickness / viewport[3]]
		);
	})

	o.position = positions;

	this.shader.drawDirect.call(this, o)


	function _pick (offset) {
		offset = max(offset, 0.);

		if (offset > texLen) {
			offset = offset % texLen
			return tex1.data.subarray(offset * 4, offset * 4 + 4)
		}

		return tex0.data.subarray(offset * 4, offset * 4 + 4)
	}
	function pick (offset) {
		let offsetLeft = Math.floor(offset);
		let offsetRight = Math.ceil(offset);
		let t = offset - offsetLeft;
		if (offsetLeft == offsetRight) {
			offsetRight = Math.ceil(offset + .5);
			t = 0.;
		}

		let left = _pick(offsetLeft);
		let right = _pick(offsetRight);

		if (t == 0.) {
			return left
		}

		let res = lerp(left, right, t)

		return res
	}
	function lerp(a, b, t) {
		if (a.length) {
			let result = a.slice()
			for (let i = 0; i < a.length; i++) {
				result[i] = lerp(a[i], b[i], t)
			}
			return result
		}
		return t * b + (1. - t) * a;
	}
	function reamp(v, amp) {
		return (v - amp[0]) / (amp[1] - amp[0]);
	}
	function summul(a, aFract, b, bFract, c, cFract) {
		return a * c
		// + a * cFract
		+ b * c
		// + b * cFract
		+ aFract * c
		+ bFract * c
		// + aFract * cFract
		// + bFract * cFract

		// return (a + b) * c
	      // + (aFract + bFract) * c
	      // + (a + b) * cFract
	      // + (aFract + bFract) * cFract;
	}
	function floor (x) {
		if (x.length) return x.map(floor);
		return Math.floor(x);
	}
	function abs (x) {
		if (x.length) return x.map(abs);
		return Math.abs(x);
	}
	function sqrt (x) {
		if (x.length) return x.map(sqrt);
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
			if (y.length) return x.map(function (x, i) {
				return Math.max(x, y[i]);
			});
			return x.map(function (x, i) {
				return Math.max(x, y);
			});
		}
		return Math.max(x, y);
	}
	function min (x, y) {
		if (x.length) {
			if (y.length) return x.map(function (x, i) {
				return Math.min(x, y[i]);
			});
			return x.map(function (x, i) {
				return Math.min(x, y);
			});
		}
		return Math.min(x, y);
	}

}


module.exports = Waveform
