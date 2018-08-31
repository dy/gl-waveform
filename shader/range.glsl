// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
// #pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')

attribute float id, sign;

uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, sampleStepFract, total, totals, translate, dataLength, translateri, translateriFract, translater, translatei, translates, sampleStepRatio, sampleStepRatioFract;
uniform float dataShapeStepFract, dataShapeStep;
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

	// offset += translateri;
	// baseOffset += translateri;
	// vec2 uv = vec2(
	// 	floor(mod(offset, dataShape.x)) + .5,
	// 	// floor(offset / dataShape.x) + .5
	// 	280.5
	// ) / dataShape;

	vec2 uv = vec2(
		mod(offset, dataShape.x),
		280.5
		// (floor(offset * dataShapeStep + offset * dataShapeStepFract) + .5)
	) * (dataShapeStep + dataShapeStepFract);

	// uv.y -= textureId;

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

	float id = float(id);

	// float id = id - 1.;
	float offset = id * (sampleStep + sampleStepFract);

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri - translateriFract) * (sampleStepRatio + sampleStepRatioFract);

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	float baseOffset = offset - sampleStep * 2. - sampleStepFract * 2.;
	float offset0 = offset - sampleStep - sampleStepFract;
	float offset1 = offset;
	// if (isEnd) offset = total - 1.;

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id + 1.) * (sampleStep + sampleStepFract) > 8192. * 2.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sample0 = isStart ? vec4(0) : pick(offset0, baseOffset);
	vec4 sample1 = pick(offset1, baseOffset);
	vec4 samplePrev = pick(baseOffset, baseOffset);
	vec4 sampleNext = pick(offset + sampleStep + sampleStepFract, baseOffset);

	// avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;
	// avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;
	// avgNext = (sampleNext.y - sample1.y) / sampleStep;
	avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) * (sampleStepRatio + sampleStepRatioFract);
	avgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) * (sampleStepRatio + sampleStepRatioFract);
	avgNext = (sampleNext.y - sample1.y) * (sampleStepRatio + sampleStepRatioFract);

	// σ(x)² = M(x²) - M(x)²

	// error proof variance calculation
	float offset0l = floor(offset0);
	float offset1l = floor(offset1);
	float t0 = offset0 - offset0l;
	float t1 = offset1 - offset1l;
	float ti0 = 1. - t0;
	float ti1 = 1. - t1;
	float offset0r = ceil(offset0l + max(t0, .5));
	float offset1r = ceil(offset1l + max(t1, .5));

	avgCurr = (
		+ pick(offset1l, baseOffset).y * sampleStepRatio * ti1
		+ pick(offset1r, baseOffset).y * sampleStepRatio * t1
		- pick(offset0l, baseOffset).y * sampleStepRatio * ti0
		- pick(offset0r, baseOffset).y * sampleStepRatio * t0

		+ pick(offset1l, baseOffset).y * sampleStepRatioFract * ti1
		+ pick(offset1r, baseOffset).y * sampleStepRatioFract * t1
		- pick(offset0l, baseOffset).y * sampleStepRatioFract * ti0
		- pick(offset0r, baseOffset).y * sampleStepRatioFract * t0
	);

	float variance = abs(
		// (sample1.z - sample0.z) / sampleStep - avgCurr * avgCurr
		// summul(sample1.z, sample1.w, -sample0.z, -sample0.w, sampleStepRatio, sampleStepRatioFract) - avgCurr * avgCurr

		+ (sample1.z - sample0.z) * sampleStepRatio
		// + (sample1.w - sample0.w) * sampleStepRatio

		// + (
		// 	+ _pick(offset1l, baseOffset).z * ti1
		// 	+ _pick(offset1r, baseOffset).z * t1
		// 	- _pick(offset0l, baseOffset).z * ti0
		// 	- _pick(offset0r, baseOffset).z * t0
		// ) * sampleStepRatio
		// + (
		// 	+ _pick(offset1l, baseOffset).w * ti1
		// 	+ _pick(offset1r, baseOffset).w * t1
		// 	- _pick(offset0l, baseOffset).w * ti0
		// 	- _pick(offset0r, baseOffset).w * t0
		// ) * sampleStepRatio

		// + _pick(offset1l, baseOffset).z * sampleStepRatio * ti1
		// + _pick(offset1r, baseOffset).z * sampleStepRatio * t1
		// - _pick(offset0l, baseOffset).z * sampleStepRatio * ti0
		// - _pick(offset0r, baseOffset).z * sampleStepRatio * t0

		// + _pick(offset1l, baseOffset).z * sampleStepRatioFract * ti1
		// + _pick(offset1r, baseOffset).z * sampleStepRatioFract * t1
		// - _pick(offset0l, baseOffset).z * sampleStepRatioFract * ti0
		// - _pick(offset0r, baseOffset).z * sampleStepRatioFract * t0

		// + _pick(offset1l, baseOffset).w * sampleStepRatio * ti1
		// + _pick(offset1r, baseOffset).w * sampleStepRatio * t1
		// - _pick(offset0l, baseOffset).w * sampleStepRatio * ti0
		// - _pick(offset0r, baseOffset).w * sampleStepRatio * t0

		// + _pick(offset1l, baseOffset).w * sampleStepRatioFract * ti1
		// + _pick(offset1r, baseOffset).w * sampleStepRatioFract * t1
		// - _pick(offset0l, baseOffset).w * sampleStepRatioFract * ti0
		// - _pick(offset0r, baseOffset).w * sampleStepRatioFract * t0

		- avgCurr * avgCurr
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
