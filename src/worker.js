/**
 * @module  gl-waveform/src/worker
 *
 * Worker thread for storage
 */

'use strict';

const createStorage = require('./storage');

module.exports = function (self) {
	let storage = createStorage();

	self.addEventListener('message', (e) => {
		let {action, args} = e.data;
		args.push(change);
		storage[action].apply(storage, args);
	});

	function change (err, data) {
		if (err) return;
		postMessage(data);
	}
}
