// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: deamp = require('./deamp.glsl')
#pragma glslify: pick = require('./pick.glsl')

attribute float id, sign, side;

uniform sampler2D samples, prevSamples, nextSamples, fractions, prevFractions, nextFractions;
uniform float opacity, thickness, pxStep, sampleStep, total, translate;
uniform vec4 viewport, color;
uniform vec2 amplitude;

varying vec4 fragColor;
varying float avgCurr, avgNext, avgPrev, avgMin, avgMax, sdev, normThickness;


void main() {
	gl_PointSize = 1.5;

	normThickness = thickness / viewport.w;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	// compensate snapping for low scale levels
	float posShift = 0.;

	bool isStart = offset <= max( -translate, 0.);
	bool isEnd = offset >= total - translate - 1.;

	float offset0 = offset - sampleStep * .5;
	float offset1 = offset + sampleStep * .5;
	float offsetPrev = offset - sampleStep - sampleStep * .5;
	float offsetNext = offset + sampleStep + sampleStep * .5;

	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sample0 = pick(samples, offset0, offsetPrev, translate);
	vec4 sample1 = pick(samples, offset1, offsetPrev, translate);
	vec4 samplePrev = pick(samples, offsetPrev, offsetPrev, translate);
	vec4 sampleNext = pick(samples, offsetNext, offsetPrev, translate);

	// error proof variance calculation
	float offset0l = floor(offset0);
	float offset1l = floor(offset1);
	float offset0r = offset0l + 1.;
	float offset1r = offset1l + 1.;
	float offsetPrevl = floor(offsetPrev);
	float offsetPrevr = offsetPrevl + 1.;
	float offsetNextl = floor(offsetNext);
	float offsetNextr = offsetNextl + 1.;
	float t0 = offset0 - offset0l;
	float t1 = offset1 - offset1l;
	// FIXME: optimize tNext, tPrev knowing the fact of sampleStep ratio
	float tNext = offsetNext - offsetNextl;
	float tPrev = offsetPrev - offsetPrevl;

	// ALERT: this formula took 9 days
	// the order of operations is important to provide precision
	// that comprises linear interpolation and range calculation
	// x - amplitude, y - sum, z - sum2, w - x offset
	vec4 sample0l = pick(samples, offset0l, offsetPrev, translate);
	vec4 sample0r = pick(samples, offset0r, offsetPrev, translate);
	vec4 sample1r = pick(samples, offset1r, offsetPrev, translate);
	vec4 sample1l = pick(samples, offset1l, offsetPrev, translate);
	vec4 sample1lf = pick(fractions, offset1l, offsetPrev, translate);
	vec4 sample0lf = pick(fractions, offset0l, offsetPrev, translate);
	vec4 sample1rf = pick(fractions, offset1r, offsetPrev, translate);
	vec4 sample0rf = pick(fractions, offset0r, offsetPrev, translate);

	vec4 samplePrevl = pick(samples, offsetPrevl, offsetPrev, translate);
	vec4 sampleNextl = pick(samples, offsetNextl, offsetPrev, translate);
	vec4 samplePrevlf = pick(fractions, offsetPrevl, offsetPrev, translate);
	vec4 sampleNextlf = pick(fractions, offsetNextl, offsetPrev, translate);
	vec4 samplePrevr = pick(samples, offsetPrevr, offsetPrev, translate);
	vec4 sampleNextr = pick(samples, offsetNextr, offsetPrev, translate);
	vec4 samplePrevrf = pick(fractions, offsetPrevr, offsetPrev, translate);
	vec4 sampleNextrf = pick(fractions, offsetNextr, offsetPrev, translate);

	avgCurr = (
		+ sample1l.y
		- sample0l.y
		+ sample1lf.y
		- sample0lf.y
		// + t1 * (sample1r.y - sample1l.y)
		// - t0 * (sample0r.y - sample0l.y)
		// + t1 * (sample1rf.y - sample1lf.y)
		// - t0 * (sample0rf.y - sample0lf.y)
	) / sampleStep;


	// because for 0 offset sample0l === sample1l - texture is clamped
	if (isStart) avgCurr = sample1l.x;

	avgPrev = (
		+ sample0l.y
		- samplePrevl.y
		+ sample0lf.y
		- samplePrevlf.y
		// + t0 * (sample0r.y - sample0l.y)
		// - tPrev * (samplePrevr.y - samplePrevl.y)
		// + t0 * (sample0rf.y - sample0lf.y)
		// - tPrev * (samplePrevrf.y - samplePrevlf.y)
	) / sampleStep;

	avgNext = (
		+ sampleNextl.y
		- sample1l.y
		+ sampleNextlf.y
		- sample1lf.y
		// + tNext * (sampleNextr.y - sampleNextl.y)
		// - t1 * (sample1r.y - sample1l.y)
		// + tNext * (sampleNextrf.y - sampleNextlf.y)
		// - t1 * (sample1rf.y - sample1lf.y)
	) / sampleStep;

	float mx2 = (
		+ sample1l.z
		- sample0l.z
		+ sample1lf.z
		- sample0lf.z
		// + t1 * (sample1r.z - sample1l.z)
		// - t0 * (sample0r.z - sample0l.z)
		// + t1 * (sample1rf.z - sample1lf.z)
		// - t0 * (sample0rf.z - sample0lf.z)
	)  / sampleStep;
	float m2 = avgCurr * avgCurr;

	// m2 = 1022121.01093286;
	// mx2 = 1022121.0054664367;

	// σ(x)² = M(x²) - M(x)²
	float variance = abs(mx2 - m2);


	sdev = sqrt(variance);
	sdev /= abs(amplitude.y - amplitude.x);

	avgCurr = deamp(avgCurr, amplitude);
	avgNext = deamp(avgNext, amplitude);
	avgPrev = deamp(avgPrev, amplitude);

	// compensate for sampling rounding
	vec2 position = vec2(
		(pxStep * id) / viewport.z,
		avgCurr
	);

	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev), pxStep / viewport.w
	));
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr), pxStep / viewport.w
	));

	vec2 bisec = normalize(normalLeft + normalRight);
	vec2 vert = vec2(0, 1);
	float bisecLen = abs(1. / dot(normalLeft, bisec));
	float vertRightLen = abs(1. / dot(normalRight, vert));
	float vertLeftLen = abs(1. / dot(normalLeft, vert));
	float maxVertLen = max(vertLeftLen, vertRightLen);
	float minVertLen = min(vertLeftLen, vertRightLen);

	// 2σ covers 68% of a line. 4σ covers 95% of line
	float vertSdev = 2. * sdev / normThickness;

	vec2 join;

	if (isStart) {
		join = normalRight;
	}
	else if (isEnd) {
		join = normalLeft;
	}
	// sdev less than projected to vertical shows simple line
	// FIXME: sdev should be compensated by curve bend
	else if (vertSdev < maxVertLen) {
		// sdev more than normal but less than vertical threshold
		// rotates join towards vertical
		if (vertSdev > minVertLen) {
			float t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);
			join = lerp(bisec * bisecLen, vert * maxVertLen, t);
		}
		else {
			join = bisec * bisecLen;
		}
	}
	// sdev more than projected to vertical modifies only y coord
	else {
		join = vert * vertSdev;
	}

	// figure out closest to current min/max
	avgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);
	avgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);

	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);
}
