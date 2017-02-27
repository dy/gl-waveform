/**
 * @module  gl-waveform/src/storage
 *
 * Storage for the waveform data.
 * Reasonably it is the only proper way to store data for waveform renderer.
 * - it may work in webworker freeing main thread
 * - it caches multiscale min/max data
 */
'use strict';

const clamp = require('mumath/clamp')
const fromDb = require('decibels/to-gain')
const toDb = require('decibels/from-gain')
const bits = require('bit-twiddle')
const nidx = require('negative-index')
const isInt = require('is-integer')
const extend = require('object-assign')
const lerp = require('mumath/lerp')
// const colorSpectrum = require('color-spectrum');
// const ft = require('fourier-transform');


module.exports = createStorage;

	let _x = 0;

function createStorage (opts) {
	opts = opts || {};

	//max size of the buffer
	let bufferSize = opts.bufferSize || Math.pow(2, 16)*60;

	//pointer to the last sample (relative) and absolute number of items
	let lastPtr = 0, count = 0;
	let lastAvg = 0, lastDev = 0;

	//accumulator and accumulator of squares
	let accum = Array(bufferSize)
	let accum2 = Array(bufferSize)

	//inner state
	let params = {
		scale: 1,
		offset: 0,
		number: 0,
		log: false,
		minDb: -100,
		maxDb: 0
	}

	return {
		push: push,
		set: set,
		get: get,
		update: update
	};


	function update (opts, cb) {
		extend(params, opts);

		return cb && cb();
	}

	function push (chunk, cb) {
		if (!chunk) return;

		if (typeof chunk === 'number') chunk = [chunk];

		//put new samples, update their scales
		for (let i = 0; i < chunk.length; i++) {
			let ptr = (lastPtr + i) % bufferSize
			accum[ptr] = lastAvg + chunk[i];
			accum2[ptr] = lastDev + chunk[i]*chunk[i];
			lastAvg = accum[ptr]
			lastDev = accum2[ptr]
		}

		//rotate last pointer
		count += chunk.length;
		lastPtr = count % bufferSize;
		cb && cb(null, lastPtr);
	}

	function set (data, offset, cb) {
		// this.samples = Array.prototype.slice.call(data);

		// //get the data, if not explicitly passed
		// this.amplitudes = getData(this.samples, this.getRenderOptions());

		// this.render(this.amplitudes);

		// //reset some things for push
		// this.lastLen = this.samples.length;

		// cb && cb(null, [mins, maxes]);

		return this;
	}

	function get (opts, cb) {
		_x++;

		if (opts) extend(params, opts);

		//scale is group size, offset is in sample terms, number is number of groups
		let {scale, offset, number, log, minDb, maxDb} = params;

		if (offset==null || number==null) throw Error('offset and number arguments should be passed');

		//do not render not existing data
		let maxNumber = Math.floor(number);
		maxNumber = Math.min(maxNumber, Math.floor(count/scale));
		maxNumber = Math.min(maxNumber, Math.floor(bufferSize/scale));

		offset = nidx(offset, count);

		//if offset is ahead of known data
		if (offset > count) {
			let data = {average: [], variance: [], count: count};
			cb && cb(null, data);
			return data;
		}

		//rotate offset
		if (count > bufferSize) {
			offset = offset % bufferSize
		}

		let averages = Array(maxNumber),
			variances = Array(maxNumber)

		for (let i = 0; i < maxNumber; i++) {
			let idx = (offset + scale * i) % bufferSize;

			idx = Math.min(idx, count - 1)

			//interpolate value for lower scales
			if (scale < .01) {
				let lIdx = Math.floor( idx ),
					rIdx = Math.ceil( idx );

				if (lIdx === rIdx) {
					averages[i] = accum[lIdx]
				}
				else {
					let t = idx - lIdx;
					let left = accum[lIdx] - (accum[(!lIdx ? accum.length : lIdx) - 1] || 0)
					let right = accum[rIdx] - accum[lIdx]

					averages[i] = lerp(left, right, t)
				}

				variances[i] = 0
			}

			//take fast avg for larger scales
			else {
				let lIdx = Math.max(0, idx - scale);

				let lt = lIdx - Math.floor(lIdx),
					rt = idx - Math.floor(idx)

				let left = lerp(accum[Math.floor(lIdx)], accum[Math.ceil(lIdx)], lt)
				let right = lerp(accum[Math.floor(idx)], accum[Math.ceil(idx)], rt)
				let leftVar = lerp(accum2[Math.floor(lIdx)], accum2[Math.ceil(lIdx)], lt)
				let rightVar = lerp(accum2[Math.floor(idx)], accum2[Math.ceil(idx)], rt)

				let avg = (right - left) / scale
				averages[i] = avg
				variances[i] = (rightVar - leftVar) / scale - avg*avg
			}
		}

		let data = {average: averages, variance: variances, count: count}

		setTimeout(() => {
			cb && cb(null, data)
		})

		return data
	}
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
