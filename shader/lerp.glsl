// linear interpolation
vec4 lerp(vec4 a, vec4 b, float t) {
	return t * b + (1. - t) * a;
}
vec2 lerp(vec2 a, vec2 b, float t) {
	return t * b + (1. - t) * a;
}

#pragma glslify: export(lerp)
