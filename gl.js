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
const texture = require('gl-util/texture')
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
			size: 4,
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

	if (this.alpha && this.background) this.canvas.style.background = this.background;
}

Waveform.prototype.render = function () {
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

	let {width, height} = this.canvas;
	program(this.gl, this.program);

	//draw info line
	attribute(this.gl, 'data', [0,0,0,0,1,0,0,0], this.program);
	uniform(this.gl, 'color', this._infoColor, this.program);
	gl.drawArrays(gl.LINES, 0, 2);


	//draw waveform
	if (!data) data = this.data;
	if (!data) return this;

	let tops = data.max, bottoms = data.min, avgs = data.average, vars = data.variance;

	if (!tops || !tops.length) return this;

	uniform(this.gl, 'color', this._color, this.program);

	//draw average line
	let position = Array(width*8);
	for (let i = 0, j=0; i < width; i++, j+=4) {
		position[j] = i/width;
		position[j+1] = avgs[i];
		position[j+2] = avgs[i];
		position[j+3] = 0;
	}
	attribute(this.gl, 'data', position, this.program);
	gl.drawArrays(gl.LINE_STRIP, 0, width);

	//fill min/max shape
	for (let i = 0, j=0; i < width; i++, j+=8) {
		let x = i/width;
		position[j] = x;
		position[j+1] = 1//Math.max(tops[i]);
		position[j+2] = avgs[i];
		position[j+3] = vars[i];
		position[j+4] = x;
		position[j+5] = -1//Math.min(bottoms[i]);
		position[j+6] = avgs[i];
		position[j+7] = vars[i];
	}

	attribute(this.gl, 'data', position, this.program);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, width*2);



	uniform(this.gl, 'color', [1,1,1,1], this.program);

	//draw average line
	// for (let i = 0, j=0; i < width; i++, j+=4) {
	// 	position[j] = i/width;
	// 	position[j+1] = avgs[i];
	// 	position[j+2] = avgs[i];
	// 	position[j+3] = 0;
	// }
	// attribute(this.gl, 'data', position, this.program);
	// gl.drawArrays(gl.LINE_STRIP, 0, width);

	return this;
}



Waveform.prototype.vert = `
precision highp float;

attribute vec4 data;

varying float variance, mean, top, bottom;

void main () {
	mean = data.z;
	variance = data.w*.5;
	top = data.x;
	bottom = data.y;
	gl_Position = vec4(data.x*2.-1., data.y, 0, 1);
}
`;

Waveform.prototype.frag = `
precision highp float;

const float TAU = ${Math.PI * 2};

uniform vec4 color;
uniform vec2 shape;

varying float variance, mean, top, bottom;

float norm (float x, float variance) {
	variance = max(variance, 1e-6);
	return exp(-.5 * pow(x, 2.) / variance);
}

void main () {
	float amp = gl_FragCoord.y / shape.y;
	float dist = abs(amp - mean*.5 - .5);

	gl_FragColor = vec4(vec3( 1. - norm(dist, variance) ), 1);
}
`;
