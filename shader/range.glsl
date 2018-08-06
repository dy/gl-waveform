// output range-average samples line with sdev weighting

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, pxStep, sampleStep, total, translate, translateInt, translateFract, dataLength;
uniform vec4 viewport, color;

varying vec4 fragColor;

void main() {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep + translateInt * sampleStep;

	if (offset < 0.) return;
	if (offset > total - 1.) return;

	bool isStart = offset - sampleStep < 0.;
	bool isEnd = offset + sampleStep > total - 1.;
	if (isEnd) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sample0 = isStart ? vec4(0) : pick(offset - sampleStep, offset - sampleStep * 2.);
	vec4 sample1 = pick(offset, offset - sampleStep * 2.);
	vec4 samplePrev = pick(offset - sampleStep * 2., offset - sampleStep * 2.);
	vec4 sampleNext = pick(offset + sampleStep, offset - sampleStep * 2.);

	float avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	float avgPrev = offset - sampleStep * 2. < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;
	float avgNext = (sampleNext.y - sample1.y) / sampleStep;

	// σ(x)² = M(x²) - M(x)²
	float variance = abs(
		(sample1.z - sample0.z) / sampleStep - avgCurr * avgCurr
	);
	float sdev = sqrt(variance);

	// compensate for sampling rounding
	vec2 position = vec2(
		(pxStep * (id - translateFract) ) / viewport.z,
		avgCurr * .5 + .5
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev) * .5, x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr) * .5, x
	) / viewport.zw);

	vec2 bisec = normalize(normalLeft + normalRight);
	vec2 vert = vec2(0, 1);
	float bisecLen = abs(1. / dot(normalLeft, bisec));
	float vertRightLen = abs(1. / dot(normalRight, vert));
	float vertLeftLen = abs(1. / dot(normalLeft, vert));
	float maxVertLen = max(vertLeftLen, vertRightLen);
	float minVertLen = min(vertLeftLen, vertRightLen);
	float vertSdev = sdev * viewport.w / thickness;

	// for small sampleStep that makes sharp transitions thinner
	// because signal is less likely normal distribution
	// for large sampleStep that makes for correct grouped signal width
	// we guess signal starts looking like normal
	// 2σ covers 95% of signal with normal distribution noise
	float thicknessCoef = max(.25, min(pow(sampleStep * .5, .5), 2.));
	vertSdev *= thicknessCoef;

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

	// mark adjacent texture with different color
	if (translate + (id + 1.) * sampleStep > 64. * 64.) {
		fragColor.x *= .5;
	}
}
