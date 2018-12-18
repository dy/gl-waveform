// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: Samples = require('./samples.glsl')
#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: reamp = require('./reamp.glsl')
#pragma glslify: pick = require('./pick.glsl')

attribute float id, sign, side;

uniform Samples samples, fractions;
uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, sampleStepFract, total, totals, translate, sampleStepRatio, sampleStepRatioFract;
uniform vec4 viewport, color;
uniform vec2 amp;

attribute vec2 _position;

varying vec4 fragColor;
varying float avgCurr, avgNext, avgPrev, avgMin, avgMax, sdev, normThickness;

void main() {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	// normThickness = thickness / viewport.w;

	// float offset = id * sampleStep + id * sampleStepFract;

	// bool isPrevStart = id == 1.;
	// bool isStart = false;//id <= 0.;//-translates;
	// bool isEnd = false;//id >= floor(totals - translates - 1.);

	// float baseOffset = offset - sampleStep * 2. - sampleStepFract * 2.;
	// float offset0 = offset - sampleStep - sampleStepFract;
	// float offset1 = offset;
	// if (isEnd) offset = total - 1.;

	// // calc average of curr..next sampling points
	// // vec4 sample0 = isStart ? vec4(0) : pick(samples, offset0, baseOffset, translatei);
	// vec4 sample0 = pick(samples, offset0, baseOffset, translate);
	// vec4 sample1 = pick(samples, offset1, baseOffset, translate);
	// vec4 samplePrev = pick(samples, baseOffset, baseOffset, translate);
	// vec4 sampleNext = pick(samples, offset + sampleStep + sampleStepFract, baseOffset, translate);

	// // avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	// avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) * sampleStepRatio + (sample0.y - samplePrev.y) * sampleStepRatioFract;
	// avgNext = (sampleNext.y - sample1.y) * sampleStepRatio + (sampleNext.y - sample1.y) * sampleStepRatioFract;

	// // error proof variance calculation
	// float offset0l = floor(offset0);
	// float offset1l = floor(offset1);
	// float t0 = offset0 - offset0l;
	// float t1 = offset1 - offset1l;
	// float offset0r = offset0l + 1.;
	// float offset1r = offset1l + 1.;

	// // ALERT: this formula took 9 days
	// // the order of operations is important to provide precision
	// // that comprises linear interpolation and range calculation
	// // x - amplitude, y - sum, z - sum2, w - x offset
	// vec4 sample0l = pick(samples, offset0l, baseOffset, translate);
	// vec4 sample0r = pick(samples, offset0r, baseOffset, translate);
	// vec4 sample1r = pick(samples, offset1r, baseOffset, translate);
	// vec4 sample1l = pick(samples, offset1l, baseOffset, translate);
	// vec4 sample1lf = pick(fractions, offset1l, baseOffset, translate);
	// vec4 sample0lf = pick(fractions, offset0l, baseOffset, translate);
	// vec4 sample1rf = pick(fractions, offset1r, baseOffset, translate);
	// vec4 sample0rf = pick(fractions, offset0r, baseOffset, translate);

	// if (isStart) {
	// 	avgCurr = sample1.x;
	// }
	// else if (isPrevStart) {
	// 		avgCurr = (sample1.y - sample0.y) * sampleStepRatio;
	// 	}
	// else {
	// 	avgCurr = (
	// 		+ sample1l.y
	// 		- sample0l.y
	// 		+ sample1lf.y
	// 		- sample0lf.y
	// 		+ t1 * (sample1r.y - sample1l.y)
	// 		- t0 * (sample0r.y - sample0l.y)
	// 		+ t1 * (sample1rf.y - sample1lf.y)
	// 		- t0 * (sample0rf.y - sample0lf.y)
	// 	) * sampleStepRatio + (
	// 		+ sample1l.y
	// 		- sample0l.y
	// 		+ sample1lf.y
	// 		- sample0lf.y
	// 		+ t1 * (sample1r.y - sample1l.y)
	// 		- t0 * (sample0r.y - sample0l.y)
	// 		+ t1 * (sample1rf.y - sample1lf.y)
	// 		- t0 * (sample0rf.y - sample0lf.y)
	// 	) * sampleStepRatioFract;
	// }

	// float mx2 = (
	// 	+ sample1l.z
	// 	- sample0l.z
	// 	+ sample1lf.z
	// 	- sample0lf.z
	// 	+ t1 * (sample1r.z - sample1l.z)
	// 	- t0 * (sample0r.z - sample0l.z)
	// 	+ t1 * (sample1rf.z - sample1lf.z)
	// 	- t0 * (sample0rf.z - sample0lf.z)
	// )  * sampleStepRatio + (
	// 	+ sample1l.z
	// 	- sample0l.z
	// 	+ sample1lf.z
	// 	- sample0lf.z
	// 	+ t1 * (sample1r.z - sample1l.z)
	// 	- t0 * (sample0r.z - sample0l.z)
	// 	+ t1 * (sample1rf.z - sample1lf.z)
	// 	- t0 * (sample0rf.z - sample0lf.z)
	// )  * sampleStepRatioFract;
	// float m2 = avgCurr * avgCurr;

	// // σ(x)² = M(x²) - M(x)²
	// float variance = abs(mx2 - m2);

	// sdev = sqrt(variance);
	// sdev /= abs(amp.y - amp.x);

	// avgCurr = reamp(avgCurr, amp);
	// avgNext = reamp(avgNext, amp);
	// avgPrev = reamp(avgPrev, amp);

	// // compensate for sampling rounding
	// vec2 position = vec2(
	// 	(pxStep * (id) ) / viewport.z,
	// 	avgCurr
	// );

	// float x = pxStep / viewport.z;
	// vec2 normalLeft = normalize(vec2(
	// 	-(avgCurr - avgPrev), x
	// ) / viewport.zw);
	// vec2 normalRight = normalize(vec2(
	// 	-(avgNext - avgCurr), x
	// ) / viewport.zw);

	// vec2 bisec = normalize(normalLeft + normalRight);
	// vec2 vert = vec2(0, 1);
	// float bisecLen = abs(1. / dot(normalLeft, bisec));
	// float vertRightLen = abs(1. / dot(normalRight, vert));
	// float vertLeftLen = abs(1. / dot(normalLeft, vert));
	// float maxVertLen = max(vertLeftLen, vertRightLen);
	// float minVertLen = min(vertLeftLen, vertRightLen);

	// // 2σ covers 68% of a line. 4σ covers 95% of line
	// float vertSdev = 2. * sdev / normThickness;

	// vec2 join;

	// if (isStart || isPrevStart) {
	// 	join = normalRight;
	// }
	// else if (isEnd) {
	// 	join = normalLeft;
	// }
	// // sdev less than projected to vertical shows simple line
	// // FIXME: sdev should be compensated by curve bend
	// else if (vertSdev < maxVertLen) {
	// 	// sdev more than normal but less than vertical threshold
	// 	// rotates join towards vertical
	// 	if (vertSdev > minVertLen) {
	// 		float t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);
	// 		join = lerp(bisec * bisecLen, vert * maxVertLen, t);
	// 	}
	// 	else {
	// 		join = bisec * bisecLen;
	// 	}
	// }
	// // sdev more than projected to vertical modifies only y coord
	// else {
	// 	join = vert * vertSdev;
	// }

	// // figure out closest to current min/max
	// avgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);
	// avgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);

	// position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(_position * 2. - 1., 0, 1);
}
