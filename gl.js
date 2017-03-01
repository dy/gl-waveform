/**
 * @module gl-waveform/gl
 *
 * Webgl waveform renderer
 */

'use strict';

const Waveform = require('./src/core');
const inherit = require('inherits');
const rgba = require('color-rgba');
const attribute = require('gl-util/attribute')
const uniform = require('gl-util/uniform')
const program = require('gl-util/program')

inherit(WaveformGl, Waveform)

module.exports = WaveformGl;

function WaveformGl (opts) {
	if (!(this instanceof Waveform)) return new WaveformGl(opts);

	opts = opts || {};

	Waveform.call(this, opts);

	this.gl = this.context;

	this.program = program(this.gl, this.vert, this.frag);

	attribute(this.gl, {
		//max, min, mean, variance sequence
		data: {
			size: 2,
			usage: this.gl.STREAM_DRAW
		}
	}, this.program);
}

WaveformGl.prototype.antialias = true;
WaveformGl.prototype.alpha = false;
WaveformGl.prototype.premultipliedAlpha = true;
WaveformGl.prototype.preserveDrawingBuffer = false;
WaveformGl.prototype.depth = false;


WaveformGl.prototype.update = function (opts) {
	Waveform.prototype.update.call(this, opts);

	this._color = rgba(this.color)
	this._background = rgba(this.background)
	this._infoColor = rgba(this.infoColor)

	if (this.gl) {
		program(this.gl, this.program);
		uniform(this.gl, 'shape', [this.canvas.width, this.canvas.height], this.program);
	}

	// if (this.alpha && this.background) {
	// 	this.canvas.style.background = this.background;
	// }
}

Waveform.prototype.render = function () {
	if (!this.gl) return this;

	this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
	if (!this.alpha) {
		let bg = this._background;
		this.gl.clearColor(...bg);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
	}
	this.emit('render')
	this.draw()

	return this;
}


WaveformGl.prototype.draw = function (data) {
	let gl = this.gl;

	let {width} = this.canvas
	let pixelRatio = this.pixelRatio || 1
	program(this.gl, this.program)

	//draw info line
	attribute(this.gl, 'data', [0,0,1,0], this.program);
	uniform(this.gl, 'color', this._infoColor, this.program);
	gl.drawArrays(gl.LINES, 0, 2);


	//draw waveform
	if (!data) data = this.data;
	if (!data) return this;

	let avgs = data.average, vars = data.variance, count = data.count;
	if (!avgs || !avgs.length) return;

	uniform(this.gl, 'color', this._color, this.program);

	//draw average line
	let position = Array(width*4);
	for (let i = 0, j = 0, l = Math.min(count, width); i < l; i++, j+=2) {
		position[j] = (i + .5)/width;
		position[j+1] = avgs[i];
	}

	attribute(this.gl, 'data', position, this.program);
	gl.drawArrays(gl.LINE_STRIP, 0, width);

	//create line shape
	let dist = 1.5 * pixelRatio
	for (let i = 0, j = 0, l = Math.min(count, width); i < l; i++, j+=4) {
		let x = (i + .5) / width;
		let sdev = Math.sqrt(Math.max(vars[i], 1e-6))
		position[j] = x;
		position[j+1] = avgs[i] - dist * sdev;
		position[j+2] = x;
		position[j+3] = avgs[i] + dist * sdev;
	}

	let attr = attribute(this.gl, 'data', position, this.program);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, width*2);

	this.emit('draw');

	return this;
}



Waveform.prototype.vert = `
precision highp float;

attribute vec2 data;

void main () {
	gl_Position = vec4(data.x*2.-1., data.y, 0, 1);
}
`;

Waveform.prototype.frag = `
precision highp float;

uniform vec4 color;
uniform vec2 shape;

void main () {
	gl_FragColor = color;
}
`;
