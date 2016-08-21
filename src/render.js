/**
 * @module  gl-waveform/src/render
 *
 * Acquire data for renderer, ie. samples → per-pixel amplitude values.
 */
'use strict';

const clamp = require('mumath/clamp');
const fromDb = require('decibels/to-gain');
const toDb = require('decibels/from-gain');

module.exports = render;

/**
 *
 * @param {Array} samples Amplitudes data
 * @param {Object} opts How to render data: should contain width, number, offset, log, min, max
 *
 * @return {Array(width|width*2)} Amplitudes for straight curve or tops/bottoms curves joined into single array
 */
function render (samples, opts) {
	let {width, number, offset, log, min, max, outline} = opts;

	number = Math.floor(number);

	let start = offset == null ? -number : offset;
	if (start < 0) {
		start = samples.length + start;
	}
	start = Math.max(start, 0);

	let data = [], amp, x;

	//non-outline is simple line by amplitudes
	if (!outline) {
		for (let x = 0; x < width; x++) {
			let i = (number - 1) * x / width;

			//ignore out of range data
			if (i + start >= samples.length) break;

			amp = f(inter(samples, i + start), log, min, max);

			data.push(amp);
		}
	}
	//create outline shape based on max values
	else {
		//collect tops/bottoms first
		let tops = [], bottoms = [];
		let lastX = 0, maxTop = 0, maxBottom = 0, sum = 0, sumTop = 0, sumBottom = 0, count = 0;

		for (let x = .5; x < width; x++) {
			let i = number * x / width;

			let lx = Math.floor(x);
			let rx = Math.ceil(x);
			let li = number * lx / width;
			let ri = number * rx / width;

			// ignore out of range data
			if (Math.ceil(ri) + start >= samples.length) break;

			for (let i = Math.max(Math.floor(li), 0); i < ri; i++) {
				amp = f(samples[i + start], log, min, max);

				sum += amp;
				count++;

				if (amp > 0) {
					sumTop += amp;
					maxTop = Math.max(maxTop, amp);
				}
				else {
					sumBottom += amp;
					maxBottom = Math.min(maxBottom, amp);
				}
			}

			let avgTop = sumTop / count;
			let avgBottom = sumBottom / count;
			let top = avgTop*.15 + maxTop*.85;
			let bottom = avgBottom*.15 + maxBottom*.85;

			tops.push(top);
			bottoms.push(bottom);
			maxTop = 0;
			maxBottom = 0;
			sumTop = 0;
			sumBottom = 0;
			count = 0;
		}

		data = [tops, bottoms];
	}

	return data;
}

function inter (data, idx) {
	let lIdx = Math.floor( idx ),
		rIdx = Math.ceil( idx );

	let t = idx - lIdx;

	let left = data[lIdx], right = data[rIdx];

	return left * (1 - t) + right * t;
}


function f(ratio, log, min, max) {
	if (log) {
		let db = toDb(Math.abs(ratio));
		db = clamp(db, min, max);

		let dbRatio = (db - min) / (max - min);

		ratio = ratio < 0 ? -dbRatio : dbRatio;
	}
	else {
		min = fromDb(min);
		max = fromDb(max);
		let v = clamp(Math.abs(ratio), min, max);

		v = (v - min) / (max - min);
		ratio = ratio < 0 ? -v : v;
	}

	return clamp(ratio, -1, 1);
}
