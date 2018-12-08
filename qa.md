## What's the best way to push data?

* `wf.push(data)`
	+ simple
	- does not cover splice, update subrange
		+ these are internally covered with simple update of full array
* `wf.update({data: {$push: data}})`
	- a bit complex
	- extra-convention, does not look nice
	+ covers any sort of sub-update
* `wf.update({data: stream})`
	+ nice single use-case
	- too specific use-case
* `wf.update({data: largerData})`
	- opinionated non-generic use-case
	+ nice solution for a single use-case
	- not acceptible for typed arrays
	- can be confusing for the case of full data update

Ideally we have something generic, fast and natural, like array API, or subrange of data to update.

* implementing array methods: push, splice, shift, unshift
	- not the best fit for the case
* implementing buffer-list methods: insert, delete
	+ pretty generic
	- a bit of convention and new methods
	- a bit of overkill: insert rewrites the whole texture anyways, we can/have to decompose it internally as `update({data: newData}).append(extraData)`
* subrance update flag: update({data, insert: pos})
	+ no need for delete, since `update({ data: newData })` covers that
* append option: `update({ append: newData })`
	+ obvious solution
	+ saved convention
	? what happens in case of `update({ data: data, append: newData})`
		+ that concats data and newData.

### Reducing options

* `log` amplitude option is removed since that is domain-specific knowledge, input data can be transformed in userland in any non-linear fashion; also it is likely to be reflected in grid anyways. That simplifies shader, although requires data transformation and complicates switching between modes.
* `loudness` weighting can be applied by user, since not all use-cases include sound.
* audio-waveform component is better fit for all audio-specific options, including handling audio-buffers, formats, cartesian/time grid etc.


### Introducing getters/setters

* wf.range = [0, 100] vs wf.update({range: [0,100]}), typing-wise
* faster update - oftentimes you just update range or some property, now there is a single setter for it
* getting auto-calculated values, eg. null/default range is calculated from data
- aliases difficulty
- duplication of API: user may have to make a choice
	* not necessarily: update applies object/aliases/diffing, props are just direct
- no easy way to organize private state, making use of weakmap is a footgun
