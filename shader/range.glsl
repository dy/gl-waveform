// output range-average samples line with sdev weighting

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, pxStep, sampleStep, total, translateInt, translateFract;
uniform vec2 scale, translate;
uniform vec4 viewport, color;

varying vec4 fragColor;

void main() {
	gl_PointSize = 1.5;

	// shift source id to provide left offset
	float id = id;

	float offset = id * sampleStep;
	float tr = floor(translate.x / sampleStep);
	bool isStart = offset + tr <= 0.;
	bool isEnd = offset + tr >= total - 1.;

	// calc average of curr..next sampling points
	vec4 sample0 = pick(offset - sampleStep + tr, offset - sampleStep * 2. + tr);
	vec4 sample1 = pick(offset, offset - sampleStep * 2.);
	vec4 samplePrev = pick(offset - sampleStep * 2. + tr, offset - sampleStep * 2. + tr);
	vec4 sampleNext = pick(offset + sampleStep + tr, offset - sampleStep * 2. + tr);

	float avgCurr = 0., avgPrev = 0., avgNext = 0.,
		sdev = 0., variance = 0.;

	// 0 sample has sum/sum2 already
	if (isStart || isEnd) {
		avgCurr = avgPrev = sample0.x;
	}
	else {
		avgCurr = (sample1.y - sample0.y) / sampleStep;
		avgPrev = (sample0.y - samplePrev.y) / sampleStep;
		avgNext = (sampleNext.y - sample1.y) / sampleStep;
		// only scales more than 1 skip pxSteps
		// σ(x)² = M(x²) - M(x)²
		variance = abs(
			(sample1.z - sample0.z) / sampleStep - avgCurr * avgCurr
		);
		sdev = sqrt(variance);
	}

	// compensate for sampling rounding
	float translateOff = translate.x / sampleStep - floor(translate.x / sampleStep);
	vec2 position = vec2(
		// avg render is shifted by .5 relative to direct sample render for proper positioning
		(pxStep * (id - translateOff) ) / viewport.z,
		avgCurr * .5 + .5
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev) * .5, x
	));
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr) * .5, x
	));

	vec2 bisec = normalize(normalLeft + normalRight);
	vec2 vert = vec2(0, 1);
	float bisecLen = abs(1. / dot(normalLeft, bisec));
	float vertRightLen = abs(1. / dot(normalRight, vert));
	float vertLeftLen = abs(1. / dot(normalLeft, vert));
	float maxVertLen = max(vertLeftLen, vertRightLen);
	float minVertLen = min(vertLeftLen, vertRightLen);
	float vertSdev = 2. * sdev * viewport.w / thickness;

	vec2 join;

	// sdev less than projected to vertical shows simple line
	// FIXME: sdev should be compensated by curve bend
	if (vertSdev < maxVertLen) {
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

	fragColor = color / 255.;

	// if (translate.x + id * sampleStep > dataLength) {
	// 	fragColor.x *= .5;
	// }

	fragColor.a *= opacity;
}
