// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

#pragma glslify: lerp = require('./lerp.glsl')

uniform vec2 dataShape;
uniform float sum, sum2;


// pick integer offset
vec4 picki (sampler2D data0, sampler2D data1, float offset, float baseOffset, float translate) {
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

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (sampler2D data0, sampler2D data1, float offset, float baseOffset, float translate) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = picki(data0, data1, offsetLeft, baseOffset, translate);

	vec4 sample;
	if (t == 0. || offsetLeft == offsetRight) {
		sample = left;
	}
	else {
		vec4 right = picki(data0, data1, offsetRight, baseOffset, translate);

		sample = lerp(
			left,
			right,
		t);
	}

	return sample;
}

vec4 pick (sampler2D data0, sampler2D data1, float a, float b) {
	return pick(data0, data1, a, b, 0.);
}


#pragma glslify: export(pick)
