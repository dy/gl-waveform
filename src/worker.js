/**
 * @module  gl-waveform/src/worker
 *
 * Complete waveform data might be megabytes, recalc waveform in frame is too slow.
 * We have to do it here.
 */

module.exports = (self) => {
	self.addEventListener('message', (e) => {
		let samples = e.samples, result = [];

		//ignore empty data
		if (!data) return postMessage();

		result = render(samples);

		self.postMessage(result);
	});
};


function render (samples) {

}