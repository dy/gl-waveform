/**
 * @module gl-waveform/2d
 *
 * Lightweight waveform renderer
 */
'use strict';

const Waveform = require('./src/core');
const alpha = require('color-alpha');


module.exports = function (opts) {
	opts = opts || {};
	opts.context = '2d';
	opts.draw = draw;
	opts.redraw = redraw;
	let wf = new Waveform(opts);

	//shift canvas instead of redrawing the whole set
	wf.on('push', chunk => {
		wf.redraw();
	});

	wf.on('update', opts => {
		wf.redraw();
	});

	wf.on('set', data => {
		wf.redraw();
	});

	return wf;
}


function redraw (from, to) {
	if (this.isDirty) {
		return this;
	}

	this.isDirty = true;

	let offset = this.offset;

	if (offset == null) {
		offset = -this.viewport[2];
	}

	if (from == null) {
		from = offset * this.scale;
	}
	if (to == null) {
		to = (offset + this.viewport[2]) * this.scale;
	}

	this.storage.get({
		scale: this.scale,
		from: from,
		to: to,
		log: this.log
	}, (err, data) => {
		this.render(data);
		this.emit('redraw', data);
	});
}


function draw ([tops, bottoms]) {
	//clean flag
	if (this.isDirty) this.isDirty = false;

	let ctx = this.context;
	let width = this.viewport[2];
	let height = this.viewport[3];
	let left = this.viewport[0];
	let top = this.viewport[1];

	let mid = height*.5;

	ctx.clearRect(this.viewport[0] - 1, this.viewport[1] - 1, width + 2, height + 2);


	//draw central line with active color
	ctx.fillStyle = alpha(this.active || this.getColor(.5), .4);
	ctx.fillRect(left, top + mid, width, .5);

	if (!tops || !bottoms || !tops.length || !bottoms.length) return this;

	//create line path
	ctx.beginPath();

	let amp = tops[0];
	ctx.moveTo(left + .5, top + mid - amp*mid);

	//generate gradient
	let style = this.getColor(1);

	//calc spectrumColor(experimental)
	if (this.spectrumColor) {
		style = ctx.createLinearGradient(this.viewport[0], 0, this.viewport[0] + tops.length, 0);
		for (let i = 0; i < colors.length; i++) {
			let r = i / colors.length;
			style.addColorStop(r, colors[i]);
		}
	}

	//low scale has 1:1 data
	if (this.scale < 2) {
		for (let x = 0; x < tops.length; x++) {
			amp = tops[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}
		ctx.strokeStyle = style;
		ctx.stroke();
	}
	else {
		for (let x = 0; x < tops.length; x++) {
			amp = tops[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}
		for (let x = 0; x < bottoms.length; x++) {
			amp = bottoms[bottoms.length - 1 - x];
			ctx.lineTo(left + bottoms.length - 1 - x, top + mid - amp*mid);
		}
		ctx.fillStyle = style;
		ctx.fill();
	}

	ctx.closePath();

	return this;
};
