/**
 * @module  gl-waveform/src/worker
 *
 * Worker thread for storage
 */

'use strict';

const createStorage = require('./storage');

module.exports = function (self) {
	let storage;

	self.addEventListener('message', (e) => {
		let {action, args} = e.data;

		//create storage
		if (action === 'init') {
			storage = createStorage(args[0]);
		}

		//forward method call
		else {
			args.push((err, data) => {
				postMessage({action, data});
			});
			storage[action].apply(storage, args);
		}
	});
}
