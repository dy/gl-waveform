// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
// #pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')

attribute float id, sign;

uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates, sampleStepRatio;
uniform vec4 viewport, color;
uniform  vec2 amp;

varying vec4 fragColor;
varying float avgPrev, avgCurr, avgNext, sdev;




uniform sampler2D data0, data1;
uniform vec2 dataShape;
uniform float sum, sum2;
uniform float textureId;

vec4 _pick (float offset, float baseOffset) {
	offset = max(offset, 0.);

	offset += translateri;
	baseOffset += translateri;
	vec2 uv = vec2(
		floor(mod(offset, dataShape.x)) + .5,
		floor(offset / dataShape.x) + .5
	) / dataShape;

	vec4 sample;
	// use last sample for textures past 2nd
	if (uv.y > 2.) {
		sample = texture2D(data1, vec2(1, 1));
		sample.x = 0.;
	}
	else if (uv.y > 1.) {
		uv.y = uv.y - 1.;

		sample = texture2D(data1, uv);

		// if right sample is from the next texture - align it to left texture
		if (offset >= dataShape.x * dataShape.y &&
			baseOffset < dataShape.x * dataShape.y) {
			sample.y += sum;
			sample.z += sum2;
		}

	}
	else {
		sample = texture2D(data0, uv);
	}

	return sample;
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (float offset, float baseOffset) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = _pick(offsetLeft, baseOffset);

	if (t == 0. || offsetLeft == offsetRight) return left;
	else {
		vec4 right = _pick(offsetRight, baseOffset);

		return lerp(left, right, t);
	}
}



void main() {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) * (sampleStepRatio);

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	float baseOffset = offset - sampleStep * 2.;
	float offset0 = offset - sampleStep;
	float offset1 = offset;
	// if (isEnd) offset = total - 1.;

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id + 1.) * sampleStep > 8192. * 2.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sample0 = isStart ? vec4(0) : pick(offset0, baseOffset);
	vec4 sample1 = pick(offset1, baseOffset);
	vec4 samplePrev = pick(baseOffset, baseOffset);
	vec4 sampleNext = pick(offset + sampleStep, baseOffset);

	avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;
	avgNext = (sampleNext.y - sample1.y) / sampleStep;


	// error proof variance calculation
	float offset0l = floor(offset0);
	float offset1l = floor(offset1);
	float t0 = offset0 - offset0l;
	float t1 = offset1 - offset1l;
	float ti0 = 1. - t0;
	float ti1 = 1. - t1;
	float offset0r = offset0l + 1.;
	float offset1r = offset1l + 1.;

	// σ(x)² = M(x²) - M(x)²
	// ALERT: this formula took 7 days
	// the order of operations is important to provide precision
	// that comprises linear interpolation and range calculation
	float mx2 =
		+ (pick(offset1l, baseOffset).z)
		- (pick(offset0l, baseOffset).z)
		+ (pick(offset1l, baseOffset).w)
		- (pick(offset0l, baseOffset).w)
		+ t1 * (pick(offset1r, baseOffset).z - pick(offset1l, baseOffset).z)
		- t0 * (pick(offset0r, baseOffset).z - pick(offset0l, baseOffset).z)
		+ t1 * (pick(offset1r, baseOffset).w - pick(offset1l, baseOffset).w)
		- t0 * (pick(offset0r, baseOffset).w - pick(offset0l, baseOffset).w)
	;
	float m2 = avgCurr * avgCurr;
	float variance = abs(mx2 * sampleStepRatio - m2);

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
