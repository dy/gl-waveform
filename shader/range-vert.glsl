// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')

attribute float id, sign;


uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translateriFract, translater, translatei, translates;
uniform vec4 viewport, color;
uniform  vec2 amp;


varying vec4 fragColor;
varying float avgPrev, avgCurr, avgNext, sdev;


void main() {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep + translateriFract;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	float baseOffset = offset - sampleStep * 2.;
	float offset0 = offset - sampleStep;
	float offset1 = offset;
	if (isEnd) offset = total - 1.;

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id + 1.) * sampleStep > 8192. * 2.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	// vec4 sample0 = isStart ? vec4(0) : pick(offset0, baseOffset, translateri);
	vec4 sample0 = pick(offset0, baseOffset, translateri);
	vec4 sample1 = pick(offset1, baseOffset, translateri);
	vec4 samplePrev = pick(baseOffset, baseOffset, translateri);
	vec4 sampleNext = pick(offset + sampleStep, baseOffset, translateri);

	// avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;
	avgNext = (sampleNext.y - sample1.y) / sampleStep;

	// error proof variance calculation
	float offset0l = floor(offset0);
	float offset1l = floor(offset1);
	float t0 = offset0 - offset0l;
	float t1 = offset1 - offset1l;
	float offset0r = offset0l + 1.;
	float offset1r = offset1l + 1.;

	if (isStart) avgCurr = sample1.x;
	else {
		avgCurr = (
			+ pick(offset1l, baseOffset, translateri).y * (1. - t1)
			+ pick(offset1r, baseOffset, translateri).y * t1
			- pick(offset0l, baseOffset, translateri).y * (1. - t0)
			- pick(offset0r, baseOffset, translateri).y * t0
		) / sampleStep;
	}

	// ALERT: this formula took 7 days
	// the order of operations is important to provide precision
	// that comprises linear interpolation and range calculation
	float mx2 = (
		+ pick(offset1l, baseOffset, translateri).z
		- pick(offset0l, baseOffset, translateri).z
		+ pick(offset1l, baseOffset, translateri).w
		- pick(offset0l, baseOffset, translateri).w
		+ t1 * (pick(offset1r, baseOffset, translateri).z - pick(offset1l, baseOffset, translateri).z)
		- t0 * (pick(offset0r, baseOffset, translateri).z - pick(offset0l, baseOffset, translateri).z)
		+ t1 * (pick(offset1r, baseOffset, translateri).w - pick(offset1l, baseOffset, translateri).w)
		- t0 * (pick(offset0r, baseOffset, translateri).w - pick(offset0l, baseOffset, translateri).w)
	)  / sampleStep;
	float m2 = avgCurr * avgCurr;

	// σ(x)² = M(x²) - M(x)²
	float variance = abs(mx2 - m2);

	sdev = sqrt(variance);
	sdev /= abs(amp.y - amp.x);

	avgCurr = reamp(avgCurr, amp);
	avgNext = reamp(avgNext, amp);
	avgPrev = reamp(avgPrev, amp);

	// compensate for sampling rounding
	vec2 position = vec2(
		(pxStep * (id - posShift) ) / viewport.z,
		avgCurr
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev), x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr), x
	) / viewport.zw);

	vec2 bisec = normalize(normalLeft + normalRight);
	vec2 vert = vec2(0, 1);
	float bisecLen = abs(1. / dot(normalLeft, bisec));
	float vertRightLen = abs(1. / dot(normalRight, vert));
	float vertLeftLen = abs(1. / dot(normalLeft, vert));
	float maxVertLen = max(vertLeftLen, vertRightLen);
	float minVertLen = min(vertLeftLen, vertRightLen);
	float vertSdev = 2. * sdev * viewport.w / thickness;

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
	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);
}
