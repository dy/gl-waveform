'use strict'

if (require('is-browser')) {
	require('fps-indicator')('bottom-left')
	document.body.style.margin = '0'
}

require('./cases')
require('./multipass')
