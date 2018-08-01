precision highp float;

attribute float id, sign;

uniform sampler2D data0, data1;
uniform float opacity, thickness, step, textureId, total,
		samplesPerStep, sum, sum2, dataLength;
uniform vec2 scale, translate, dataShape;
uniform vec4 viewport, color;

varying vec4 fragColor;

const float lessThanThickness = 0.;

// linear interpolation
vec4 lerp(vec4 a, vec4 b, float t) {
	return t * b + (1. - t) * a;
}
vec2 lerp(vec2 a, vec2 b, float t) {
	return t * b + (1. - t) * a;
}

vec4 pickSample (float offset, float baseOffset) {
	// subtle hack to workaround rounding spikes artifacts
	float translateInt = floor(floor(translate.x / samplesPerStep) * samplesPerStep);

	vec2 uv = vec2(
		mod(offset + translateInt, dataShape.x) + .5,
		floor((offset + translateInt) / dataShape.x) + .5
	) / dataShape;

	uv.y -= textureId;

	// limit less than zero values
	if (uv.y < 0.) uv = vec2(0, 0);

	if (uv.y > 1.) {
		uv.y = uv.y - 1.;

		vec4 sample = texture2D(data1, uv);

		// if right sample is from the next texture - align it to left texture
		if (offset + translateInt >= dataLength * (textureId + 1.) && baseOffset + translateInt < dataLength * (textureId + 1.)) {
			sample.y += sum;
			sample.z += sum2;
		}

		return sample;
	}
	else return texture2D(data0, uv);
}

// pick sample from the source texture
vec4 pick(float id, float baseId) {
	float offset = id * samplesPerStep;
	float baseOffset = baseId * samplesPerStep;

	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	if (offsetLeft == offsetRight) {
		offsetRight = ceil(offset + .5);
		t = 0.;
	}

	vec4 left = pickSample(offsetLeft, baseOffset);
	vec4 right = pickSample(offsetRight, baseOffset);

	return lerp(left, right, t);
}

void main() {
	gl_PointSize = 3.;

	// shift source id to provide left offset
	float id = id - 1.;

	// FIXME: make end point cut more elegant
	if (translate.x + id * samplesPerStep >= total - 1.) return;

	// calc average of curr..next sampling points
	vec4 sample0 = pick(id, id - 1.);
	vec4 sample1 = pick(id + 1., id - 1.);

	float avgCurr = (sample1.y - sample0.y) / samplesPerStep;

	// only scales more than 1 skip steps
	// σ(x)² = M(x²) - M(x)²
	float variance = abs(
		(sample1.z - sample0.z) / samplesPerStep - avgCurr * avgCurr
	);
	float sdev = sqrt(variance);

	// compensate for sampling rounding
	float translateOff = translate.x / samplesPerStep - floor(translate.x / samplesPerStep);
	vec2 position = vec2(
		// avg render is shifted by .5 relative to direct sample render for proper positioning
		(.5 * step * (id + .5 - translateOff) ) / viewport.z,
		avgCurr * .5 + .5
	);

	vec4 samplePrev = pick(id - 1., id - 1.);
	vec4 sampleNext = pick(id + 2., id - 1.);

	float avgPrev = (sample0.y - samplePrev.y) / samplesPerStep;
	float avgNext = (sampleNext.y - sample1.y) / samplesPerStep;

	float x = .5 * step / viewport.z;
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
	float vertSdev = 2. * sdev * viewport.w / thickness;

	vec2 join;


	// less than 1
	// if (scale.x * viewport.z < 1.) {}

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

	if (translate.x + id * samplesPerStep > dataLength) {
		fragColor.x *= .5;
	}

	fragColor.a *= opacity;
}
