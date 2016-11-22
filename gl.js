/**
 * @module gl-waveform/gl
 *
 * Webgl waveform renderer
 */

'use strict';

const Waveform = require('./src/core');
const extend = require('just-extend');
const inherit = require('inherits');
const rgba = require('color-rgba');

inherit(WaveformGl, Waveform)

module.exports = WaveformGl;

function WaveformGl (opts) {
	if (!(this instanceof Waveform)) return new WaveformGl(opts);

	opts = opts || {};

	extend(opts, {
		context: {
			antialias: true,
			alpha: true,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
			depth: false
		}
	});

	Waveform.call(this, opts);

	this.setAttribute({
		samples: {
			size: 1,
			usage: this.gl.STREAM_DRAW
		}
	});
}


WaveformGl.prototype.update = function (opts) {
	Waveform.prototype.update.call(this, opts);

	//create vertices .::: → :::. corresponding to width of viewport
	let w = this.viewport[2];

	let pos = [];
	for (let i = 0; i < w; i++) {
		pos.push(i/w)
		pos.push(0)
		pos.push(i/w)
		pos.push(1)
	}
	this.setAttribute('position', pos)

	this.colorArr = rgba(this.color)
	this.infoColorArr = rgba(this.infoColor)
}


WaveformGl.prototype.draw = function (gl, vp, data) {
	if (!data) data = this.lastData;
	if (!data) return;

	let [left, top, width, height] = vp;
	let [tops, bottoms, middles] = data;

	if (!tops.length) return;


	this.setUniform('color', this.colorArr);

	let samples = Array(tops.length*2);

	//draw average line
	if (this.scale < 1) {
		for (let i = 0; i < middles.length; i++) {
			samples[i*2] = middles[i];
			samples[i*2+1] = middles[i];
		}
		this.setAttribute('samples', samples);
		gl.drawArrays(gl.LINES, 1, samples.length-1);
	}
	//fill min/max shape
	else {
		for (let i = 0; i < tops.length; i++) {
			samples[i*2] = tops[i];
			samples[i*2+1] = bottoms[i];
		}
		this.setAttribute('samples', samples);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, samples.length);
	}

}



Waveform.prototype.vert = `
precision mediump float;

attribute vec2 position;
attribute float samples;

void main () {
	vec2 coord;
	gl_Position = vec4(position.x*2.-1., samples, 0, 1);
}
`;

Waveform.prototype.frag = `
precision mediump float;

uniform vec4 color;

void main () {
	gl_FragColor = color;
}
`;
