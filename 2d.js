/**
 * @module gl-waveform/2d
 *
 * Lightweight waveform renderer
 */
'use strict';

const Waveform = require('./src/core');


module.exports = function (opts) {
	opts = opts || {};
	opts.context = '2d';
	opts.draw = draw;
	opts.redraw = redraw;

	let wf = new Waveform(opts);

	wf.on('push', (data, length) => {
		wf.redraw();
	});

	wf.on('update', opts => {
		wf.redraw();
	});

	wf.on('set', (data, length) => {
		wf.redraw();
	});

	return wf;
}


function redraw () {
	if (this.isDirty) {
		return this;
	}

	this.isDirty = true;

	let offset = this.offset;

	if (offset == null) {
		offset = -this.viewport[2] * this.scale;
	}
	this.storage.get({
		scale: this.scale,
		offset: offset,
		number: this.viewport[2],
		log: this.log,
		minDb: this.minDb,
		maxDb: this.maxDb
	}, (err, data) => {
		this.emit('redraw', data);
		this.render(data);
	});
}




//draw whole part
function draw (ctx, vp, data) {
	let [left, top, width, height] = vp;
	let [tops, bottoms, middles] = data;

	//clean flag
	if (this.isDirty) this.isDirty = false;

	let mid = height*.5;

	ctx.clearRect(left, top, width, height);

	//draw central line with active color
	ctx.fillStyle = this.infoColor;
	ctx.fillRect(left, top + mid, width, .5);

	if (!tops || !bottoms || !middles || !tops.length || !bottoms.length || !middles.length) return this;


	//generate gradient
	let style = this.color;

	//calc spectrumColor(experimental)
	// if (this.spectrumColor) {
	// 	style = ctx.createLinearGradient(left, 0, left + tops.length, 0);
	// 	for (let i = 0; i < colors.length; i++) {
	// 		let r = i / colors.length;
	// 		style.addColorStop(r, colors[i]);
	// 	}
	// }


	//stroke avg line
	let amp = middles[0];
	ctx.beginPath();
	ctx.moveTo(left, top + mid - amp*mid);
	for (let x = 0; x < middles.length; x++) {
		amp = middles[x];
		ctx.lineTo(x + left, top + mid - amp*mid);
	}
	ctx.lineWidth = this.scale <= 1 ? 1 : .5;
	ctx.strokeStyle = style;
	ctx.stroke();
	ctx.closePath();

	if (this.scale <= 1) return this;

	//fill min/max line
	ctx.beginPath();
	amp = tops[0];
	ctx.moveTo(left, top + mid - amp*mid);
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
	ctx.closePath();

	return this;
}
