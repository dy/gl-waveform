// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: Samples = require('./samples.glsl')


// pick integer offset
vec4 picki (Samples samples, float offset, float baseOffset, float translate) {
	offset = max(offset, 0.);

	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;
	baseOffset += translate;

	vec2 uv = vec2(
		floor(mod(offset, samples.shape.x)) + .5,
		floor(offset / samples.shape.x) + .5
	) / samples.shape;


	vec4 sample;

	// use last sample for textures past 2nd
	// TODO: remove when multipass rendering is implemented
	if (uv.y > 2.) {
		sample = texture2D(samples.data[1], vec2(1, 1));
		sample.x = 0.;
	}
	else if (uv.y > 1.) {
		uv.y = uv.y - 1.;

		sample = texture2D(samples.data[1], uv);

		// if right sample is from the next texture - align it to left texture
		if (offset >= samples.shape.x * samples.shape.y &&
			baseOffset < samples.shape.x * samples.shape.y) {
			sample.y += samples.sum;
			sample.z += samples.sum2;
		}
	}
	else {
		sample = texture2D(samples.data[0], uv);
	}

	return sample;
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (Samples samples, float offset, float baseOffset, float translate) {
	// offset += translate;
	// baseOffset += translate;
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = picki(samples, offsetLeft, baseOffset, translate);

	if (t == 0. || offsetLeft == offsetRight) {
		return left;
	}
	else {
		vec4 right = picki(samples, offsetRight, baseOffset, translate);

		return lerp(left, right, t);
	}
}



#pragma glslify: export(pick)
