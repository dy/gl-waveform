// output range-average samples line with sdev weighting

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: deamp = require('./deamp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

attribute float id, sign, side;

uniform Samples samples, fractions;
uniform sampler2D samplesData, fractionsData;
uniform float opacity, thickness, pxStep, sampleStep, total, translate, passNum, passId;
uniform vec4 viewport, color;
uniform vec2 amplitude;

varying vec4 fragColor;
varying vec3 statsLeft, statsRight, statsPrevRight, statsNextLeft;
varying float normThickness;

const float FLT_EPSILON = 1.19209290e-7;

// returns sample picked from the texture
vec4 picki (Samples samples, sampler2D data, float offset) {
	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;

	vec2 uv = vec2(
		floor(mod(offset, samples.shape.x)) + .5,
		floor(offset / samples.shape.x) + .5
	) / samples.shape;

	vec4 sample;

	// prev texture
	if (uv.y < 0.) {
		uv.y += 1.;
		sample = texture2D(samples.prev, uv);
		sample.y -= samples.prevSum;
		sample.z -= samples.prevSum2;
	}
	// next texture
	else if (uv.y > 1.) {
		uv.y -= 1.;
		sample = texture2D(samples.next, uv);
		sample.y += samples.sum;
		sample.z += samples.sum2;
	}
	// curr texture
	else {
		sample = texture2D(data, uv);
	}

	return sample;
}

// returns {avg, sdev, isNaN}
vec3 stats (float offset) {
	float sampleStep = sampleStep;

	float offset0 = offset - sampleStep * .5;
	float offset1 = offset + sampleStep * .5;
	float offset0l = floor(offset0);
	float offset1l = floor(offset1);
	float offset0r = ceil(offset0);
	float offset1r = ceil(offset1);

	vec4 sample = picki(samples, samplesData, offset);
	// if (sample.w == -1.) return vec3(0,0,-1);

	// head picks half the first sample
	vec4 sample0l = picki(samples, samplesData, offset0l);
	vec4 sample1l = picki(samples, samplesData, offset1l);
	vec4 sample0r = picki(samples, samplesData, offset0r);
	vec4 sample1r = picki(samples, samplesData, offset1r);

	vec4 sample0lf = picki(fractions, fractionsData, offset0l);
	vec4 sample1lf = picki(fractions, fractionsData, offset1l);
	vec4 sample0rf = picki(fractions, fractionsData, offset0r);
	vec4 sample1rf = picki(fractions, fractionsData, offset1r);

	float t0 = 0., t1 = 0.;

	// partial sample steps require precision
	// WARN: we removed lerp in order to ↑ precision
	// if (mod(sampleStep, 1.) != 0. && sample0l.w != -1. && sample1r.w != -1.) {
	// 	t0 = offset0 - offset0l, t1 = offset1 - offset1l;
	// }

	if (sample0l.w == -1.) {
		// return vec3(0,0,-1);
		// sample0l.y = 0.;
	}

	float n = (offset1l - offset0l);

	float avg = (
		+ sample1l.y
		- sample0l.y
		+ sample1lf.y
		- sample0lf.y
		// + t1 * (sample1r.y - sample1l.y)
		// - t0 * (sample0r.y - sample0l.y)
		// + t1 * (sample1rf.y - sample1lf.y)
		// - t0 * (sample0rf.y - sample0lf.y)
	);
	avg /= n;

	float mx2 = (
		+ sample1l.z
		- sample0l.z
		+ sample1lf.z
		- sample0lf.z
		// + t1 * (sample1r.z - sample1l.z)
		// - t0 * (sample0r.z - sample0l.z)
		// + t1 * (sample1rf.z - sample1lf.z)
		// - t0 * (sample0rf.z - sample0lf.z)
	);
	mx2 /= n;

	// σ(x)² = M(x²) - M(x)²
	float m2 = avg * avg;
	float variance = abs(mx2 - m2);

	// get float32 tolerance for the power of mx2/m2
	// float tol = FLT_EPSILON * pow(2., ceil(9. + log2(max(mx2, m2))));

	// float sdev = variance <= tol ? 0. : sqrt(variance);
	float sdev = sqrt(variance);

	return vec3(avg, sdev, min(sample0r.w, sample1l.w));
}


void main() {
	gl_PointSize = 3.5;
	if (color.a == 0.) return;

	normThickness = thickness / viewport.w;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	// compensate snapping for low scale levels
	float posShift = 0.;

	vec3 statsCurr = stats(offset);

	// ignore NaN amplitudes
	if (statsCurr.z == -1.) return;

	vec3 statsPrev = stats(offset - sampleStep);
	vec3 statsPrev2 = stats(offset - 2. * sampleStep);
	vec3 statsNext = stats(offset + sampleStep);
	vec3 statsNext2 = stats(offset + 2. * sampleStep);

	float avgCurr = statsCurr.x;
	float avgPrev = statsPrev.x;
	float avgPrev2 = statsPrev2.z != -1. ? statsPrev2.x : avgPrev;
	float avgNext = statsNext.x;
	float avgNext2 = statsNext2.z != -1. ? statsNext2.x : avgNext;

	float ampRange = abs(
		+ amplitude.y - amplitude.x
	);
	float sdevCurr = statsCurr.y / ampRange;
	float sdevPrev = statsPrev.y / ampRange;
	float sdevPrev2 = statsPrev2.y / ampRange;
	float sdevNext = statsNext.y / ampRange;
	float sdevNext2 = statsNext2.y / ampRange;

	float sdev = sdevCurr;

	avgCurr = deamp(avgCurr, amplitude);
	avgNext = deamp(avgNext, amplitude);
	avgNext2 = deamp(avgNext2, amplitude);
	avgPrev = deamp(avgPrev, amplitude);
	avgPrev2 = deamp(avgPrev2, amplitude);

	// compensate for sampling rounding
	vec2 position = vec2(
		(pxStep * (id + .5)) / viewport.z,
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
	float vertSdev = 2. * sdev * viewport.w / thickness;

	vec2 join;

	if (statsPrev.z == -1.) {
		join = normalRight;
	}
	else if (statsNext.z == -1.) {
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

	// figure out segment varyings
	statsCurr = vec3(avgCurr, sdevCurr, statsCurr.z);
	statsPrev = vec3(avgPrev, sdevPrev, statsPrev.z);
	statsNext = vec3(avgNext, sdevNext, statsNext.z);
	statsNext2 = vec3(avgNext2, sdevNext2, statsNext2.z);
	statsPrev2 = vec3(avgPrev2, sdevPrev2, statsPrev2.z);
	statsRight = side < 0. ? statsCurr : statsNext;
	statsLeft = side < 0. ? statsPrev : statsCurr;
	statsPrevRight = side < 0. ? statsPrev2 : statsPrev;
	statsNextLeft = side < 0. ? statsNext : statsNext2;

	position += sign * join * .5 * thickness / viewport.zw;

	// shift position by the clip offset
	position.x += passId * pxStep * samples.length / sampleStep / viewport.z;

	gl_Position = vec4(position * 2. - 1., 0, 1);
}
