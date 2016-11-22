/**
 * @module gl-waveform/2d
 *
 * Lightweight waveform renderer
 */
'use strict';

const Waveform = require('./src/core');


module.exports = function waveform2d (opts) {
	opts = opts || {};
	opts.context = '2d';
	opts.draw = draw;

	let wf = new Waveform(opts);

	return wf;
}





//draw whole part
function draw (ctx, vp, data) {
	if (!data) data = this.lastData;
	if (!data) return;

	let [left, top, width, height] = vp;
	let [tops, bottoms, middles] = data;

	//clean flag
	if (this.isDirty) this.isDirty = false;

	let mid = height*.5;

	if (!tops || !bottoms || !middles || !tops.length || !bottoms.length || !middles.length) {
		return this;
	}

	ctx.clearRect(left, top, width, height);

	//draw central line with active color
	ctx.fillStyle = this.infoColor;
	ctx.fillRect(left, top + mid, width, .5);


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
