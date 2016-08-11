## Q: how do we measure and render time?

* We have sample rate and data length, therefore we know time.
1. We can strecth all the data to the full width of canvas.
	- the fact that the slice is always stretched is no good, we have to keep to persistent zoom
	- we have to keep and collect data somewhere else
2. We can track zoom, offset - in case if we always have more data than we can render.
	+ covers dirty job for audio-waveform - we setup a slice to render.
	- not atomic solution, i. e. one time we may want to use simpler thing
	+ we can draw any part of the wave, including the unknown
	- it complicates API
		+ which anyways should be done sooner or later
	+ in order to make combined component like [audition](http://blogs.adobe.com/creativecloud/files/2015/10/Screen-Shot-2015-10-27-at-3.03.42-PM.png), we need to keep API similar.
	✔ ok, push(data) is the best way for the api, with `offset` and `width` params
		? but how do we rewrite all the data at once?

## Q: what is better - 1. zoom & offset, 2. width & offset or 3. start & end?

1. + easy to scale at the current stop-time
	- difficult to find out the length of current visible slice - is it canvas width / zoom? or bg texture width / zoom? We not always have access to canvas dimensions.
2. + rect-like coords
	+ less hassle with managing the right side of window, we don’t run outside of known time - offset is always in known range (we cannot set it behind the left border, but we can see ahead of the right border).
	+ we naturally keep window size constant - just change the offset
	+ null-offset makes it move automatically to the right, or actual view, which is a bit more difficult with start/end
	- questionable relationship with pixels. How do we get 1:1 scale, for example to mind 20px gap ahead, or draw at the middle of the view, like iphone dictaphone? We need to know canvas dimensions and set the width === width of canvas. And for the gap, offset = length - gapInPixels * (width/canvasWidth)

3. + same as audioBufferSource - we use time units.
	- audioBufferSource has different nature - never you need to show the data outside of bounds
	+ more flexible control of the zoomed area, i.e we can just easy move any side of the window, even keeping width constant

## Q: how it is more useful to manage offset - as a time or as a sample number?
+ numbers are more precise
	- we can round time to get number with good precision
- numbers are less intuitive
+ numbers are closer to the nature of data, they don’t wrap it with extra-layer
+ numbers are dataunit-dependless, i.e. we can use to draw any type of waveform, not only audio
	- considering that we draw dbs and s at the grid axes, it does not make a big sense
		+ passing custom grid options would solve this issue