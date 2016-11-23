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

	opts = extend({
		context: {
			antialias: true,
			alpha: true,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
			depth: false
		}
	}, opts);

	Waveform.call(this, opts);

	this.setAttribute({
		position: {
			size: 2,
			usage: this.gl.STREAM_DRAW
		}
	});
}


WaveformGl.prototype.update = function (opts) {
	Waveform.prototype.update.call(this, opts);

	this.colorArr = rgba(this.color)
	this.infoColorArr = rgba(this.infoColor)
}


WaveformGl.prototype.draw = function (gl, vp, data) {
	if (!data) data = this.lastData;
	if (!data) return;

	let [left, top, width, height] = vp;
	let [tops, bottoms, middles] = data;

	if (!tops.length) return;


	//draw info line
	this.setAttribute('position', [0,0,1,0]);
	this.setUniform('color', this.infoColorArr);
	gl.drawArrays(gl.LINES, 0, 2);


	//draw waveform
	this.setUniform('color', this.colorArr);


	//draw average line
	let position = Array(width*4);
	for (let i = 0, j=0; i < width; i++, j+=2) {
		position[j] = i/width;
		position[j+1] = middles[i];
	}
	this.setAttribute('position', position);
	gl.drawArrays(gl.LINE_STRIP, 0, width);

	//fill min/max shape
	for (let i = 0, j=0; i < width; i++, j+=4) {
		let x = i/width;
		position[j] = x;
		position[j+1] = tops[i];
		position[j+2] = x;
		position[j+3] = bottoms[i];
	}
	this.setAttribute('position', position);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, width*2);



	//draw grid afterwards
	if (this.grid) this.grid.draw(gl, vp);
}



Waveform.prototype.vert = `
precision mediump float;

attribute vec2 position;

void main () {
	vec2 coord;
	gl_Position = vec4(position.x*2.-1., position.y, 0, 1);
}
`;

Waveform.prototype.frag = `
precision mediump float;

uniform vec4 color;

void main () {
	gl_FragColor = color;
}
`;
