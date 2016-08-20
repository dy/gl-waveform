/**
 * @module  gl-waveform/src/render
 *
 * Acquire data for renderer, ie. samples → per-pixel amplitude values.
 */

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
		for (let x = .5; x < width; x++) {
			let i = number * x / width;

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
		let lastX = 0, maxTop = 0, maxBottom = 0;
		for (let i = 0; i < number; i++) {
			//ignore out of range data
			if (i + start >= samples.length) break;

			amp = f(samples[i + start], log, min, max);

			if (amp > 0) {
				maxTop = Math.max(maxTop, amp);
			}
			else {
				maxBottom = Math.min(maxBottom, amp);
			}

			x = ( (i+.5) / number ) * width;

			//if we got a new pixel
			if (x - lastX > 1) {
				lastX = x;
				tops.push(maxTop);
				bottoms.push(maxBottom);
				maxTop = 0;
				maxBottom = 0;
			}
		}

		data = tops.concat(bottoms.reverse());
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
