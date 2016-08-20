/**
 * @module  gl-waveform/src/worker
 *
 * Complete waveform data might be megabytes, recalc waveform in frame is too slow.
 * We have to do it here.
 */

const render = require('./render');


module.exports = (self) => {
	//samples for worker instance
	let samples = [];
	let options;

	self.addEventListener('message', (e) => {
		let {action, data} = e.data;
		options = e.data.options;

		//save samples
		if (action === 'push') {
			for (let i = 0; i < data.length; i++) {
				samples.push(data[i]);
			}
		}
		else if (action === 'set') {
			samples = Array.prototype.slice.call(data);

		}
	});

	setInterval(() => {
		if (!samples.length || !options) return;

		let result = render(samples, options);

		postMessage(result);
	}, 10);
};
