// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')

attribute float id, sign;

uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;
uniform vec4 viewport, color;
uniform  vec2 amp;

varying vec4 fragColor;
varying float avgPrev, avgCurr, avgNext, sdev;

void main() {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	// float id = id - 1.;
	float offset = id * sampleStep + translateri;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset) / sampleStep;

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	float baseOffset = offset - sampleStep * 2.;
	// if (isEnd) offset = total - 1.;

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id + 1.) * sampleStep > 64. * 64.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sample0 = isStart ? vec4(0) : pick(offset - sampleStep, baseOffset);
	vec4 sample1 = pick(offset, baseOffset);
	vec4 samplePrev = pick(baseOffset, baseOffset);
	vec4 sampleNext = pick(offset + sampleStep, baseOffset);

	avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;
	avgNext = (sampleNext.y - sample1.y) / sampleStep;

	// σ(x)² = M(x²) - M(x)²
	float variance = abs(
		(sample1.z - sample0.z) / sampleStep - avgCurr * avgCurr
	);
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
