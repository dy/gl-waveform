// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

#pragma glslify: lerp = require('./lerp.glsl')

uniform sampler2D data0, data1;
uniform vec2 dataShape;
uniform float sum, sum2;


// pick integer offset
vec4 picki (float offset, float baseOffset, float translate) {
	offset = max(offset, 0.);

	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;
	baseOffset += translate;

	vec2 uv = vec2(
		floor(mod(offset, dataShape.x)) + .5,
		floor(offset / dataShape.x) + .5
	) / dataShape;


	vec4 sample;

	// use last sample for textures past 2nd
	// TODO: remove when multipass rendering is implemented
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

// unloop possibly looped value
vec4 unloop (vec4 sample, float offset, float baseOffset, float translate) {
	// if sample + prev sample are not the same as sum
	// consider that the sum was looped in order to reduce float32 error
	// recalc sum as prev sum + prev sample
	vec4 prev = picki(offset - 1., baseOffset, translate);

	if (abs((prev.x + sample.x) - (sample.z - prev.z)) > 0.) {
		sample.z = prev.z + sample.x;
		sample.w = prev.w + sample.x * sample.x;
	}

	return sample;
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (float offset, float baseOffset, float translate) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = picki(offsetLeft, baseOffset, translate);

	vec4 sample;
	if (t == 0. || offsetLeft == offsetRight) {
		sample = unloop(left, offsetLeft, baseOffset, translate);
	}
	else {
		vec4 right = picki(offsetRight, baseOffset, translate);

		sample = lerp(
			unloop(left, offsetLeft, baseOffset, translate),
			unloop(right, offsetRight, baseOffset, translate),
		t);
	}


	return sample;
}

vec4 pick (float a, float b) {
	return pick(a, b, 0.);
}


#pragma glslify: export(pick)
