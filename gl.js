/**
 * @module gl-waveform/gl
 *
 * Webgl waveform renderer
 */

'use strict';

const Waveform = require('./src/core');
const extend = require('just-extend');


module.exports = function (opts) {
	opts = opts || {};

	extend(opts, {
		context: 'webgl',
		vert: vert,
		frag: frag,
		init: (opts) => {
			Waveform.init.call(this, opts);

			let gl = this.gl;

			//setup alpha
			// gl.enable( gl.BLEND );
			// gl.blendEquation( gl.FUNC_ADD );
			// gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		},

		attributes: {
			tops: {
				size: 1,
				usage: gl.STREAM_DRAW
			},
			bottoms: {
				size: 1,
				usage: gl.STREAM_DRAW
			}
		},

		update: (opts) => {
			Waveform.update.call(this, opts);

			//re-create stripes
			for (var i = 0; i < l; i++) {
				var curr = i/l;
				var next = (i+1)/l;
				data.push(curr);
				data.push(1);
				data.push(next);
				data.push(1);
				data.push(curr);
				data.push(0);
				data.push(next);
				data.push(0);
			}
		},

		draw: ([tops, bottoms]) => {
			this.setAttribute('tops', tops);
			this.setAttribute('bottoms', bottoms);

			Waveform.draw.call(this, opts);
		}
	});



	let waveform = new Waveform(opts);
}

const vert = `
precision highp float;

attribute vec2 position;

uniform sampler2D data;
uniform float minDecibels;
uniform float maxDecibels;
uniform float logarithmic;
uniform float sampleRate;
uniform vec4 viewport;


float lg (float x) {
	return log(x) / log10;
}

float decide (float a, float b, float w) {
	return step(0.5, w) * b + step(w, 0.5) * a;
}

void main () {
	vec2 coord;
	gl_Position = vec4(coord, 0, 1);
}
`;

const frag = `
precision highp float;

void main () {
	gl_FragColor = vec4(1,0,0,1);
}
`;
